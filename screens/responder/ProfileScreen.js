import { typography, spacing, colors, shadow } from '../../constants/theme';
import Avatar from "../../components/Avatar";
import useResidentProfile from "../../hooks/useResidentProfile";
import ScreenState from "../../components/ScreenState";
import { api } from '../../services/api';
import { mapResident, alertStageLabel } from '../../utils/models';
import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Text from "../../components/AppText";
import { SafeAreaView } from 'react-native-safe-area-context';
import TabBar from "../../components/tabs/ResponderTabButtons";
import { useAppData } from "../../contexts/AppDataContext";
import { StatusBadge } from "../../components/ui";

export default function ProfileScreen({ route, navigation }) {
  const { resident, alerts, loading, error } = useResidentProfile(route);
  const { alerts: myCases, account } = useAppData();

  // Only cases this responder was assigned to, even though the server returns
  // the resident's whole history to any responder ever assigned to them.
  const scanHistory = useMemo(() => {
    const mine = new Set(myCases.filter((item) => item.responderId === account.id).map((item) => item.id));
    return resident ? alerts.filter((alert) => mine.has(alert.id)) : [];
  }, [alerts, resident, myCases, account.id]);

  if (loading || error || !resident) return <ScreenState loading={loading} error={error} onBack={() => navigation.goBack()} />;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>

        <View style={styles.profileBar}>
          <Avatar uri={resident?.photoUrl} name={resident?.name} style={styles.profilePhoto} />
          <View style={styles.profileTextWrap}>
            <Text style={styles.name}>{resident?.name || 'Resident'}</Text>
            {resident?.address ? <Text style={styles.meta}>{resident.address}</Text> : null}
            <Text style={styles.meta}>{resident?.guardianName ? `Guardian: ${resident.guardianName}${resident.relationship ? ` (${resident.relationship})` : ''}${resident.guardianContact ? ` · ${resident.guardianContact}` : ''}` : 'No verified guardian'}</Text>
            <Text style={styles.meta}>{resident?.type || 'Type: Not available'}</Text>
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.heading1}>Your Cases for This Resident</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {scanHistory.length === 0 ? (
          <Text style={styles.emptyText}>No cases yet.</Text>
        ) : (
          scanHistory.map((alert) => (
            <TouchableOpacity key={alert.id} style={styles.alertCard} onPress={() => navigation.navigate('AlertDetails', { alertId: alert.id })}>
              <View style={styles.alertCardTextWrap}>
                <StatusBadge
                  status={alert.status}
                  label={alertStageLabel(alert.status)}
                />
                <Text style={styles.alertTime}>{alert.scannedAt}</Text>
              </View>
              <Text style={[styles.alertSubtitle, { fontFamily: 'Poppins_600SemiBold' }]}>{alert.location}</Text>
              <Text style={styles.alertSubtitle}>{alert.status === 'closed' ? 'Closed by a barangay official' : `Guardian: ${alert.guardianStatus} • Responder: ${alert.responderStatus}`}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screen, paddingTop: 4, paddingBottom: 0 },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.screen, paddingTop: 0 },
  back: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.primary, marginBottom: 4, marginTop: 0, minHeight: 44, paddingVertical: 4},
  heading: { fontSize: typography.title, fontFamily: 'Poppins_700Bold', marginTop: 4 , marginBottom: 8 },
  heading1: { fontSize: typography.section, fontFamily: 'Poppins_600SemiBold', marginBottom: 12 , marginTop: spacing.section },
  profileBar: { flexDirection: 'row', alignItems: 'center', padding: 16, marginTop: -12 },
  profilePhoto: { width: 100, height: 100, borderRadius: 50, borderWidth: 1.8, borderColor: colors.primary, backgroundColor: colors.shadow, marginRight: 14, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  profileTextWrap: { flex: 1 },
  name: { fontSize: typography.body, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },
  meta: { fontSize: typography.detail, fontFamily: 'Poppins_400Regular', color: colors.textSecondary },
  qrButton: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  qrButtonText: { color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: typography.body },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginBottom: 20 },
  emptyText: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, textAlign: 'center', marginTop: 20 },
  alertCard: { flexDirection: 'column', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.card, marginBottom: 16, backgroundColor: colors.surface, ...shadow.card },
  alertCardTextWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  alertTime: { fontSize: typography.caption, fontFamily: 'Poppins_400Regular', paddingVertical: 4, color: colors.textSecondary },
  alertSubtitle: { fontSize: typography.detail, fontFamily: 'Poppins_400Regular', marginLeft: 8 },
  primaryButton: { borderRadius: 10, backgroundColor: colors.primarySoft, paddingVertical: 16, alignItems: 'center', marginBottom: 8, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 , minHeight: spacing.control, justifyContent: 'center' },
  primaryButtonText: { color: colors.primary, fontSize: typography.body, fontFamily: 'Poppins_500Medium' },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 12 , minHeight: spacing.control, justifyContent: 'center' },
  secondaryButtonText: { color: colors.primary, fontSize: typography.body, fontFamily: 'Poppins_400Regular' },
  qrBox: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 20, marginBottom: 20, marginHorizontal: 16 },
  qrPlaceholder: { width: 280, height: 280, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 5, marginBottom: 25, backgroundColor: colors.surfaceSunken },
  qrPlaceholderText: { textAlign: 'center', color: colors.textMuted, fontSize: typography.caption, fontFamily: 'Poppins_500Medium' },
  qrName: { fontSize: typography.title, fontFamily: 'Poppins_500Medium', marginBottom: 6 },
  qrDetail: { fontSize: typography.body, fontFamily: 'Poppins_500Medium', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 },
});