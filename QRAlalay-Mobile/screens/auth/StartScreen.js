import { typography, spacing, colors, font, radius, tracking } from "../../constants/theme";
import React, { useState, useEffect } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Text from "../../components/AppText";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { BrandCurve, BrandDots } from '../../components/BrandHeader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginPortal from './LogIn';
import PermissionScreen, { PERMISSIONS_ACCEPTED_KEY } from './PermissionScreen';
import { useAccessibilitySettings } from "../../contexts/AccessibilitySettingsContext";

export default function StartScreen({ setSession, navigation }) {
  const { t } = useAccessibilitySettings();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [view, setView] = useState('start'); // 'start' | 'login' | 'permission'
  const [permissionsAccepted, setPermissionsAccepted] = useState(false);
  const [pendingSession, setPendingSession] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(PERMISSIONS_ACCEPTED_KEY).then((value) => {
      setPermissionsAccepted(value === 'true');
    });
  }, []);

  function handleLogInPress() {
    setView('login');
  }

  // Called by LoginPortal once the OTP is verified. Permissions are only
  // asked for once, on first login — after that, sessions go straight in.
  function handleLoginSuccess(result) {
    if (permissionsAccepted) {
      setSession(result);
      return;
    }
    setPendingSession(result);
    setView('permission');
  }

  function handlePermissionsAgreed() {
    setPermissionsAccepted(true);
    setSession(pendingSession);
  }

  if (view === 'permission') {
    return <PermissionScreen onAgree={handlePermissionsAgreed} onBack={() => setView('login')} />;
  }

  if (view === 'login') {
    return <LoginPortal setSession={handleLoginSuccess} onBack={() => setView('start')} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={[styles.band, { paddingTop: insets.top + 32 }]}>
          {focused && <StatusBar style="light" />}
          <Image
            source={require("../../assets/logo.png")}
            style={styles.icon}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessibilityLabel="QRAlalay logo"
          />
          <Text style={styles.title} accessibilityRole="header">QRAlalay</Text>
          <Text style={styles.tagline}>{t('tagline')}</Text>
          <BrandCurve height={36} />
        </View>

        <View style={styles.body}>
          <BrandDots style={{ marginBottom: 16 }} />
          <Text style={styles.lead}>Community care, within reach.</Text>
          <Text style={styles.description}>
            For barangay officials, guardians and responders of Barangay 206, Tondo, Manila. Sign in with the email your barangay registered.
          </Text>
          <Text style={styles.classification}>Capstone System Prototype · Technological University of the Philippines</Text>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.startButton} onPress={handleLogInPress} accessibilityRole="button" activeOpacity={0.8}>
          <Text style={styles.startButtonText}>{t('logIn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.emergencyButton} onPress={() => navigation.navigate('PublicEmergencyHelp')} accessibilityRole="button" activeOpacity={0.8}>
          <Text style={styles.emergencyButtonText}>Emergency help · Call Barangay / 911</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1 },
  band: { backgroundColor: colors.brand, alignItems: 'flex-start', paddingHorizontal: spacing.screen, paddingBottom: 56 },
  icon: { width: 96, height: 96, borderRadius: 22, backgroundColor: colors.onPrimary, marginBottom: 20 },
  title: { fontSize: typography.title + 4, fontFamily: font.bold, color: colors.onPrimary, letterSpacing: tracking.title, lineHeight: 42 },
  tagline: { fontSize: typography.body, fontFamily: font.medium, color: colors.onPrimary, marginTop: 4 },
  body: { paddingHorizontal: spacing.screen, paddingTop: 20, paddingBottom: 24 },
  lead: { fontSize: typography.section, fontFamily: font.semibold, color: colors.textPrimary, letterSpacing: tracking.section, lineHeight: 30, marginBottom: 8 },
  description: { fontSize: typography.body, fontFamily: font.regular, color: colors.textSecondary, lineHeight: 28, maxWidth: 560 },
  classification: { fontSize: typography.caption, fontFamily: font.regular, color: colors.textSecondary, marginTop: 20 },
  actions: { paddingHorizontal: spacing.screen, paddingTop: 12, paddingBottom: 16, gap: 8 },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
  },
  startButtonText: { color: colors.onPrimary, fontSize: typography.body, fontFamily: font.semibold },
  emergencyButton: { minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.alertBorder, backgroundColor: colors.alertSoft },
  emergencyButtonText: { color: colors.alertInk, fontSize: typography.detail, fontFamily: font.semibold, textAlign: 'center' },
});
