import { typography, spacing, colors } from "../../constants/theme";
import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import Text from "../../components/AppText";
import { SafeAreaView } from 'react-native-safe-area-context';
import { notificationPermissions } from "../../services/notifications";
import { registerDeviceForPush } from "../../services/pushRegistration";
import { PRIVACY_POLICY } from "../../constants/legalContent";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAccessibilitySettings } from "../../contexts/AccessibilitySettingsContext";

// Stored once the user accepts the privacy and data terms. Device
// permissions are no longer required here: location is requested when an
// assistance request is sent, the camera when scanning, and notifications
// are offered once after agreeing (declining never blocks the app).
export const PERMISSIONS_ACCEPTED_KEY = 'qralalay.privacyAccepted';

const SUMMARY = ['What we collect', 'How it’s used', 'What an anonymous scanner sees', 'Your rights'];

export default function PermissionScreen({ onAgree, onBack }) {
  const { t } = useAccessibilitySettings();
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const allChecked = privacyChecked && termsChecked;

  async function handleContinue() {
    if (!allChecked || requesting) return;
    setRequesting(true);
    try {
      await AsyncStorage.setItem(PERMISSIONS_ACCEPTED_KEY, 'true');
      // Optional: assistance updates arrive as notifications when allowed.
      const notifResult = await notificationPermissions.request();
      if (notifResult.granted) registerDeviceForPush();
      onAgree?.();
    } catch (err) {
      Alert.alert('Could not continue', err.message || 'Please try again.');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.back} onPress={onBack}>
          {t('back')}
        </Text>
        <Text style={styles.heading}>{t('permission')}</Text>
        <Text style={styles.subheading}>{t('requireBeforeContinuing')}</Text>

        {PRIVACY_POLICY.filter((section) => SUMMARY.includes(section.heading)).map((section) => (
          <View key={section.heading} style={styles.summary}>
            <Text style={styles.summaryHeading}>{section.heading}</Text>
            <Text style={styles.summaryBody}>{section.body}</Text>
          </View>
        ))}
        <View style={styles.summary}>
          <Text style={styles.summaryHeading}>Not a replacement for emergency services</Text>
          <Text style={styles.summaryBody}>QRAlalay sends assistance requests to your barangay. For immediate danger, call 911.</Text>
        </View>

        <CheckboxRow
          checked={privacyChecked}
          onPress={() => setPrivacyChecked((v) => !v)}
          label="I have read how QRAlalay collects and uses personal data"
        />
        <CheckboxRow
          checked={termsChecked}
          onPress={() => setTermsChecked((v) => !v)}
          label="I agree to the QRAlalay terms of use"
        />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.button, !allChecked && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!allChecked || requesting}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{requesting ? t('requesting') : t('agreeContinue')}</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>Camera, location and notification access are asked only when a feature needs them.</Text>
      </View>
    </SafeAreaView>
  );
}

function CheckboxRow({ checked, onPress, label }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkboxMark}>✓</Text>}
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.screen, paddingBottom: 40 , paddingTop: 4 },
  back: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.primary, marginBottom: 4, minHeight: 44, paddingVertical: 4, marginTop: 0 },
  heading: { fontSize: typography.title, fontFamily: 'Poppins_700Bold', marginBottom: 8 },
  subheading: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, marginBottom: 28 },

  summary: { marginBottom: 16 },
  summaryHeading: { fontSize: typography.body, fontFamily: 'Poppins_600SemiBold', color: colors.textPrimary, marginBottom: 4 },
  summaryBody: { fontSize: typography.detail, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: Math.ceil(typography.detail * 1.5) },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, marginBottom: 20 },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: colors.onPrimary, fontSize: typography.body, fontWeight: '700' },
  rowLabel: { flex: 1, fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.textPrimary, lineHeight: Math.ceil(typography.body * 1.5), paddingTop: 4 },

  bottomBar: {
    paddingHorizontal: spacing.screen,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonDisabled: { opacity: 0.5 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
   minHeight: spacing.control },
  buttonText: { color: colors.onPrimary, fontSize: typography.body, fontFamily: 'Poppins_500Medium', fontWeight: '600' },
  footnote: { textAlign: 'center', color: colors.textMuted, fontSize: typography.caption, fontFamily: 'Poppins_400Regular', marginBottom: 10 },
});
