import { typography, spacing, colors, font, radius } from "../../constants/theme";
import React, { useState, useEffect } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FontAwesome5 } from '@expo/vector-icons';
import Text from "../../components/AppText";
import TextInput from "../../components/AppTextInput";
import CommunityIllustration from "../../components/CommunityIllustration";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { BrandCurve } from '../../components/BrandHeader';
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

  const [email, setEmail] = useState('');

  // Hands the typed email to the sign-in screen, which sends the code with
  // its existing logic. An empty field just opens the sign-in screen.
  function handleContinue() {
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
    const typed = email.trim();
    return <LoginPortal setSession={handleLoginSuccess} onBack={() => setView('start')} initialEmail={typed} autoSend={!!typed} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {focused && <StatusBar style="light" />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={[styles.topBand, { height: insets.top + 34 }]}>
            <BrandCurve height={30} color="#F4F9FC" />
          </View>

          <View style={styles.hero}>
            <View>
              <Image source={require('../../assets/qralalay-heart.png')} style={styles.heart} resizeMode="contain"
                accessibilityIgnoresInvertColors accessibilityLabel="QRAlalay logo" />
              <Svg width={44} height={36} viewBox="0 0 44 36" style={styles.sparkle} accessible={false}>
                <Path d="M6 30 14 18M20 26 24 10M30 30 40 20" stroke={colors.warning} strokeWidth={4} strokeLinecap="round" />
              </Svg>
            </View>
            <Text style={styles.wordmark} accessibilityRole="header">QRAlalay</Text>
            <Text style={styles.welcome} lang="fil">Maligayang Pagdating!</Text>
            <Text style={styles.lead} lang="fil">Sama-sama para sa mas ligtas,{'\n'}mas maalagang komunidad.</Text>
            <Svg width={120} height={12} viewBox="0 0 120 12" accessible={false} style={{ marginTop: 8 }}>
              <Path d="M4 8C34 2 82 2 116 7" stroke={colors.warning} strokeWidth={4} strokeLinecap="round" fill="none" />
            </Svg>
          </View>

          <CommunityIllustration width="100%" height={180} style={styles.illustration} />

          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={styles.mailIcon}><FontAwesome5 name="envelope" size={22} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} lang="fil">Mag-login gamit ang Email (OTP)</Text>
                <Text style={styles.sheetHint} lang="fil">Ipadadala namin ang one-time code sa iyong email.</Text>
              </View>
            </View>

            <View style={styles.inputWrap}>
              <FontAwesome5 name="envelope" size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Ilagay ang iyong email"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={handleContinue}
                accessibilityLabel="Email address"
              />
            </View>

            <TouchableOpacity style={styles.continue} onPress={handleContinue} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Magpatuloy, send my sign-in code">
              <Text style={styles.continueText} lang="fil">Magpatuloy</Text>
              <FontAwesome5 name="arrow-right" size={18} color={colors.onPrimary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.emergency} onPress={() => navigation.navigate('PublicEmergencyHelp')} accessibilityRole="button">
              <FontAwesome5 name="phone-alt" size={14} color={colors.alertInk} />
              <Text style={styles.emergencyText}>Emergency? Barangay / 911</Text>
            </TouchableOpacity>
          </View>

          <Svg width="100%" height={44 + insets.bottom} viewBox="0 0 400 60" preserveAspectRatio="none" style={styles.bottomWave} accessible={false}>
            <Path d="M0 26C80 6 150 40 230 26S340 8 400 22V60H0Z" fill={colors.warning} opacity={0.85} />
            <Path d="M0 38C90 20 170 52 260 38S360 24 400 34V60H0Z" fill={colors.brand} />
          </Svg>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F9FC' },
  content: { flexGrow: 1 },
  topBand: { backgroundColor: colors.brand },
  hero: { alignItems: 'center', paddingHorizontal: spacing.screen, paddingTop: 4 },
  heart: { width: 168, height: 168 },
  sparkle: { position: 'absolute', right: -30, bottom: -6 },
  wordmark: { fontFamily: font.bold, fontSize: 42, lineHeight: 50, color: colors.navy, letterSpacing: -1.2, marginTop: 2 },
  welcome: { fontFamily: font.bold, fontSize: typography.section + 2, color: colors.navy, letterSpacing: -0.4, marginTop: 6, textAlign: 'center' },
  lead: { fontFamily: font.regular, fontSize: typography.detail + 1, lineHeight: 25, color: colors.textPrimary, textAlign: 'center', marginTop: 4 },
  illustration: { marginTop: 4, marginBottom: -14 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: spacing.screen - 4, paddingTop: 20, paddingBottom: 14,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  mailIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: font.bold, fontSize: typography.body, lineHeight: 24, color: colors.navy },
  sheetHint: { fontFamily: font.regular, fontSize: typography.caption, lineHeight: 20, color: colors.textSecondary, marginTop: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, paddingHorizontal: 16, minHeight: 56, backgroundColor: colors.surface },
  input: { flex: 1, fontFamily: font.regular, fontSize: typography.body, color: colors.textPrimary, minHeight: 54, paddingVertical: 0 },
  continue: { marginTop: 14, minHeight: 60, borderRadius: 30, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  continueText: { fontFamily: font.bold, fontSize: typography.body + 2, color: colors.onPrimary },
  emergency: { marginTop: 8, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emergencyText: { fontFamily: font.semibold, fontSize: typography.detail, color: colors.alertInk },
  bottomWave: { marginTop: -2, backgroundColor: colors.surface },
});
