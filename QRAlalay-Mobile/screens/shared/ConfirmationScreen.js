import { typography, spacing, colors } from "../../constants/theme";
import Avatar from "../../components/Avatar";
// Shared by guardian and responder — the two role-specific files under
// src/screens/{guardian,responder}/ConfirmationScreen.js used to be an
// entire byte-for-byte duplicated screen (styles included), differing only
// in which role they report the confirmation as and the "Not Safe" bullet
// copy. This is the single implementation; each role's file just supplies
// those two things.
import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import Text from "../../components/AppText";
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAppData } from "../../contexts/AppDataContext";

const SAFE_BULLETS = [
  'This records your own observation that the resident is safe.',
  'It does not close the request. A barangay official reviews all observations and the assistance report.',
  'Report only what you have confirmed yourself.',
];

export default function ConfirmationScreen({ route, navigation, role, notSafeBullets }) {
  const status = route.params?.status || (route.params?.decision === 'safe' ? 'Safe' : route.params?.decision === 'not_safe' ? 'Not Safe' : null);
  const resident = route.params?.resident || { name: route.params?.residentName || 'Resident', id: '' };
  const alertId = route.params?.alertId || route.params?.incidentId;

  const [submitting, setSubmitting] = useState(false);
  const { alerts, updateAlertConfirmation } = useAppData();
  const alert = alerts.find((item) => item.id === alertId);
  const currentResident = alert ? { name: alert.residentName, id: alert.residentId, photoUrl: alert.residentPhotoUrl } : resident;

  const isSafe = status === 'Safe';

  async function handleConfirm() {
    if (submitting) return;
    if (!alertId || !['Safe', 'Not Safe'].includes(status)) {
      Alert.alert('Missing alert', 'Return to the alert list and choose a safety action.');
      return;
    }
    setSubmitting(true);
    try {
      await updateAlertConfirmation(alertId, role, status);
      Alert.alert(isSafe ? 'Safe observation recorded' : 'Not Safe observation recorded',
        isSafe ? 'A barangay official will review the request before it is closed.' : 'The barangay will see that the resident may still need help.');
      navigation.navigate('AlertDetails', { alertId });
    } catch (err) { Alert.alert('Could not record observation', err.message); }
    finally { setSubmitting(false); }
  }

  const bullets = isSafe ? SAFE_BULLETS : notSafeBullets;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.heading1}>Report your observation: is this resident {isSafe ? 'safe' : 'not safe'}?</Text>

        <Avatar uri={currentResident.photoUrl} name={currentResident.name} style={styles.profilePhoto} />
        <Text style={styles.subheading}>{currentResident.name}</Text>

        <View style={styles.bulletBox}>
          {bullets.map((line, i) => (
            <View key={i} style={styles.bulletRow}>
              <FontAwesome5 name="exclamation-circle" size={20} color={isSafe ? colors.successInk : colors.alertInk} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.confirmButton, isSafe ? styles.confirmButtonSafe : styles.confirmButtonNotSafe]} disabled={submitting} onPress={handleConfirm}>
          <Text style={[styles.confirmButtonText, isSafe ? styles.safeText : styles.notSafeText]}>{isSafe ? 'Report Safe' : 'Report Not Safe'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', padding: spacing.screen },
  heading1: { fontSize: typography.section, fontFamily: 'Poppins_500Medium', color: colors.textSecondary, marginTop: spacing.section, marginBottom: 12, textAlign: 'center' },
  subheading: { fontSize: typography.section, fontFamily: 'Poppins_700Bold', textAlign: 'center', marginBottom: 4 },
  subheading1: { fontSize: typography.body, fontFamily: 'Poppins_500Medium', color: colors.textSecondary, marginBottom: 20, textAlign: 'center' },
  subheading2: { fontSize: typography.detail, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  profilePhoto: { width: 140, height: 140, borderRadius: 70, borderWidth: 1.8, borderColor: colors.primary, backgroundColor: colors.shadow, marginBottom: 20, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 },
  bulletBox: { width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
  bulletIcon: { marginRight: 14, marginTop: 12 },
  bulletText: { flex: 1, fontSize: typography.detail, fontFamily: 'Poppins_400Regular', color: colors.textPrimary },
  bottomBar: { paddingHorizontal: spacing.screen, paddingBottom: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  confirmButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 8, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 , minHeight: spacing.control, justifyContent: 'center' },
  confirmButtonSafe: { borderColor: colors.successInk, backgroundColor: colors.successSoft },
  confirmButtonNotSafe: { borderColor: colors.alertInk, backgroundColor: colors.alertSoft },
  confirmButtonText: { fontFamily: 'Poppins_500Medium', fontSize: typography.body },
  safeText: { color: colors.successInk },
  notSafeText: { color: colors.alertInk },
  button: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 16, alignItems: 'center', width: '100%', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 , minHeight: spacing.control, justifyContent: 'center' },
  blueButton: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  buttonText: { color: colors.textPrimary, fontFamily: 'Poppins_500Medium', fontSize: typography.body },
  blueText: { color: colors.primary },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  resultIconWrap: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  resultIconSafe: { backgroundColor: colors.successInk },
  resultIconNotSafe: { backgroundColor: colors.alertInk },
  residentCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.card, marginBottom: 40, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 },
  residentPhoto: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.textMuted, marginRight: 14 },
  residentTextWrap: { flex: 1 },
  residentName: { fontSize: typography.body, fontFamily: 'Poppins_500Medium', marginBottom: 2 },
  residentMeta: { fontSize: typography.caption, fontFamily: 'Poppins_400Regular', color: colors.textSecondary },
});
