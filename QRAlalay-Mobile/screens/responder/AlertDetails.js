import { alertLayout, colors, typography, spacing } from '../../constants/theme';
import Avatar from "../../components/Avatar";
import { alertStageLabel } from '../../utils/models';
import React, { useState } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import Text from "../../components/AppText";
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAppData } from "../../contexts/AppDataContext";
import { Divider } from "../../components/ui";
import ReasonPromptModal from "../../components/modals/ReasonPromptModal";
import TabBar from "../../components/tabs/ResponderTabButtons";

export default function AlertDetails({ route, navigation }) {
  const { alerts, account, markGuardianUnreachable, markResponderUnreachable, respondToAssignment } = useAppData();
  const alert = alerts.find((item) => item.id === (route.params?.alertId || route.params?.incidentId));
  const [guardianModalVisible, setGuardianModalVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [submittingGuardian, setSubmittingGuardian] = useState(false);
  const [submittingLocation, setSubmittingLocation] = useState(false);
  const [declineVisible, setDeclineVisible] = useState(false);
  const [responding, setResponding] = useState(false);

  if (!alert) return <SafeAreaView style={styles.container}><Text onPress={() => navigation.goBack()}>‹ Back</Text><Text>Request not found. Return to the list and refresh.</Text></SafeAreaView>;

  const isAssignedResponder = alert.responderId && account?.id === alert.responderId;
  // Case actions are accepted by the server only after the responder accepts.
  const awaitingAcceptance = isAssignedResponder && alert.status !== 'closed' && alert.assignment_status === 'pending_acceptance';
  const hasAccepted = isAssignedResponder && alert.assignment_status === 'accepted';

  const respond = async (decision, reason = null) => {
    if (responding || !respondToAssignment) return;
    setResponding(true);
    try {
      await respondToAssignment(alert.id, decision, reason);
      setDeclineVisible(false);
      if (decision === 'declined') navigation.navigate('Home');
    } catch (error) {
      Alert.alert('Could not update assignment', error.message);
    } finally {
      setResponding(false);
    }
  };
  const guardianPending = alert.status !== 'closed' && !alert.officialReviewRequired && alert.guardianStatus === 'Waiting';

  const submitGuardianUnreachable = async (reason) => {
    setSubmittingGuardian(true);
    try {
      await markGuardianUnreachable(alert.id, reason);
      setGuardianModalVisible(false);
    } catch (error) {
      Alert.alert('Could not mark guardian unreachable', error.message);
    } finally {
      setSubmittingGuardian(false);
    }
  };

  const submitLocationUnreachable = async (reason) => {
    setSubmittingLocation(true);
    try {
      await markResponderUnreachable(alert.id, reason);
      setLocationModalVisible(false);
    } catch (error) {
      Alert.alert('Could not report this', error.message);
    } finally {
      setSubmittingLocation(false);
    }
  };

  const statusLabel = alertStageLabel(alert.status);
  const statusStyle = alert.status === 'closed' ? styles.closed : alert.status === 'pending' ? styles.pending : styles.danger;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>
        
        <TouchableOpacity style={[styles.residentCard, styles.shadow]} onPress={() => navigation.navigate('ProfileScreen', { residentId: alert.residentId })}
          accessibilityRole="button" accessibilityLabel={`Resident information for ${alert.residentName}`} activeOpacity={0.8}>
          <Avatar uri={alert.residentPhotoUrl} name={alert.residentName} style={styles.residentPhoto} />
          <View style={{ flex: 1, margin: 0 }}>
            <Text style={styles.contextTitle}>{alert.residentName}</Text>
            <Text style={styles.small}>Type: {alert.residentType}</Text>
            <Text style={styles.small}>Tap for resident information ›</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.statusHeader}>
          <Text style={[styles.statusPill, statusStyle]}>{statusLabel}</Text>
          <Text style={styles.time}>{alert.scannedAt}</Text>
        </View>
        <View style={styles.divider} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.section}>Reported Location</Text>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <FontAwesome5 name="map-marker-alt" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{alert.location}</Text>
                <Text style={styles.small}>Location where the QR code was scanned</Text>
                {alert.liveLocationNote ? <Text style={styles.small}>{alert.liveLocationNote}</Text> : null}
              </View>
          </View>
          {alert.mapLatitude != null && alert.mapLongitude != null && <TouchableOpacity style={styles.mapButton} onPress={async () => { if (alert.mapLatitude == null || alert.mapLongitude == null) { Alert.alert('Location unavailable', 'No location was shared with this request.'); return; } 
          try { await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${alert.mapLatitude},${alert.mapLongitude}`); } catch { Alert.alert('Could not open map'); } }}><Text style={styles.mapText}>View Location</Text></TouchableOpacity>}
        </View>
        
        <Text style={styles.section}>Reported By</Text>
        <View style={styles.card}><View style={styles.iconRow}>
          <Image source={require("../../assets/profile.png")} style={styles.smallPhoto} />
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{alert.scannedBy}</Text>
            <Text style={styles.small}>Sent the request by scanning the resident's QR card</Text>
          </View>
        </View></View>
        
        <Text style={styles.section}>Bystander Note</Text>
        <View style={styles.card}><Text style={styles.note}>{alert.bystanderNote || 'No note was submitted by the bystander.'}</Text></View>

        <Text style={styles.section}>Responder Assigned</Text>
         <View style={styles.card}>
          <View style={styles.iconRow}>
            <Avatar uri={alert.responderPhotoUrl} name={alert.responderName} style={styles.smallPhoto} />
            <View style={{ flex: 1 }}>
              {alert.responderName ? (
                <>
                  <Text style={styles.cardTitle}>{alert.responderName}</Text>
                  <Text style={styles.small}>Barangay Responder</Text>
                </>
              ) : (
                <>
                  <Text style={styles.cardTitle}>No responder assigned</Text>
                  <Text style={styles.small}>This request is waiting for a responder.</Text>
                </>
              )}
            </View>
          </View>
          {awaitingAcceptance && (
            <>
              <Text style={[styles.small, { marginTop: 8 }]}>Accept this assignment before reporting observations or submitting a report.</Text>
              <TouchableOpacity style={styles.summaryButton} disabled={responding} onPress={() => respond('accepted')} accessibilityRole="button">
                <Text style={styles.summaryButtonText}>{responding ? 'Saving…' : 'Accept Assignment'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cantReachButton} disabled={responding} onPress={() => setDeclineVisible(true)} accessibilityRole="button">
                <Text style={styles.cantReachText}>Decline Assignment</Text>
              </TouchableOpacity>
            </>
          )}
          {hasAccepted && alert.status !== 'closed' && !alert.responderUnreachableReason && (
            <TouchableOpacity style={styles.cantReachButton} onPress={() => setLocationModalVisible(true)}>
              <Text style={styles.cantReachText}>Can't Reach Location</Text>
            </TouchableOpacity>
          )}
          {alert.responderUnreachableReason ? <Text style={[styles.small, { marginTop: 8 }]}>Reported unable to reach location: {alert.responderUnreachableReason}</Text> : null}
        </View>

        <Text style={styles.section}>Safety Observations</Text>
        {alert.hasDiscrepancy && (
          <View style={styles.discrepancyCard}>
            <FontAwesome5 name="exclamation-triangle" size={16} color={colors.alertInk} />
            <View style={{ flex: 1, marginLeft: 9 }}>
              <Text style={styles.escalationTitle}>Guardian and Responder Disagree</Text>
              <Text style={styles.small}>One says Safe, the other says Not Safe. Verify directly before this alert closes.</Text>
            </View>
          </View>
        )}
        <View style={styles.confirmCard}>
          <Confirmation label="Guardian" value={alert.guardianStatus} />
          <Divider />
          <Confirmation label="Responder" value={alert.responderName ? alert.responderStatus : 'Waiting'} />
          <Text style={styles.small}>Guardian: {alert.guardian_required === false ? 'Not registered' : alert.guardianName || 'Registered guardian'}</Text>
          {alert.guardianUnreachableReason ? <Text style={styles.small}>Unreachable{alert.guardianUnreachableBySystem ? ' (auto-flagged)' : ''}: {alert.guardianUnreachableReason}</Text> : null}
          {alert.guardian_contact_attempt_reason ? <Text style={styles.small}>Latest contact attempt: {alert.guardian_contact_attempt_reason}</Text> : null}
          {hasAccepted && guardianPending && (
            <TouchableOpacity style={styles.cantReachButton} onPress={() => setGuardianModalVisible(true)}>
              <Text style={styles.cantReachText}>Document Guardian Contact Attempt</Text>
            </TouchableOpacity>
          )}
        </View>

        {alert.status === 'escalated' && <View style={styles.escalationCard}>
          <FontAwesome5 name="exclamation-triangle" size={20} color={colors.alertInk} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.escalationTitle}>Request Escalated</Text>
            <Text style={styles.small}>{alert.escalationReason || 'Further response is required.'}</Text>
          </View></View>}
        
        {alert.status === 'closed' && (
          <View style={styles.closedCard}>
            <FontAwesome5 name="check-circle" size={20} color={colors.successInk} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.closedTitle}>Alert Closed</Text>
              <Text style={styles.small}>
                {alert.cancelledReason ? 'Cancelled by the bystander who raised it — likely a false alarm.' : 'This case is closed.'}
              </Text>
            </View>
          </View>
        )}

        <ReasonPromptModal
          visible={guardianModalVisible}
          title="Document the guardian contact attempt"
          placeholder="e.g. called three times over 20 minutes, no answer"
          confirmLabel="Save Contact Attempt"
          submitting={submittingGuardian}
          onCancel={() => setGuardianModalVisible(false)}
          onSubmit={submitGuardianUnreachable}
        />
        <ReasonPromptModal
          visible={locationModalVisible}
          title="Why can't you reach the location?"
          placeholder="e.g. address doesn't exist, gate locked, unsafe to approach"
          confirmLabel="Report This"
          submitting={submittingLocation}
          onCancel={() => setLocationModalVisible(false)}
          onSubmit={submitLocationUnreachable}
        />

        <ReasonPromptModal
          visible={declineVisible}
          title="Why are you declining this assignment?"
          placeholder="Record why you cannot take this case"
          confirmLabel="Decline Assignment"
          submitting={responding}
          onCancel={() => setDeclineVisible(false)}
          onSubmit={(reason) => respond('declined', reason)}
        />

        {(hasAccepted || (isAssignedResponder && alert.incidentReport)) && <TouchableOpacity style={styles.summaryButton} onPress={() => navigation.navigate('IncidentReportScreen', { alertId: alert.id, resident: { photoUrl: alert.residentPhotoUrl, name: alert.residentName, id: alert.residentId } })}>
          <Text style={styles.summaryButtonText}>{!hasAccepted ? 'View Assistance Report' : alert.incidentReport ? 'View / Update Assistance Report' : 'Submit Assistance Report'}</Text>
        </TouchableOpacity>}
        
        {alert.officialReviewRequired && (
          <View style={styles.readOnlyNote}>
            <FontAwesome5 name="clipboard-check" size={14} color={colors.textSecondary} style={{ marginHorizontal: 6 }} />
            <Text style={styles.readOnlyText}>
              Official review: {alert.backendStatus === 'closed'
                ? 'Approved'
                : alert.readyForReview
                ? 'Pending review'
                : 'Confirm Safe and submit your report. A barangay official will review and close this alert.'}
            </Text>
          </View>
        )}
      </ScrollView>
      <TabBar />
    </SafeAreaView>
  );
}

function Confirmation({ label, value }) {
  const safe = value === 'Safe'; const notSafe = value === 'Not Safe';
  return <View style={styles.confirmRow}><Text style={styles.confirmLabel}>{label}</Text><Text style={[styles.confirmPill, safe ? styles.safe : notSafe ? styles.notSafe : styles.waiting]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, 
  content: { padding: spacing.screen, paddingBottom: 0 , paddingTop: 4 }, 
  scrollContent: { padding: spacing.screen, paddingTop: 0, paddingBottom: 30 }, 
  back: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.primary, marginBottom: 4, marginTop: 0, minHeight: 44, paddingVertical: 4},
  residentCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.primarySoft, padding: spacing.card, marginBottom: 16 },
  residentPhoto: { width: 85, height: 100, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.border, marginRight: 11 },
  small: { fontSize: typography.caption, color: colors.textSecondary, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  contextTitle: { fontSize: typography.body, fontFamily: 'Poppins_600SemiBold' },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 }, 

  statusHeader: { flexWrap: 'wrap', gap: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 , ...alertLayout.headerRow }, 
  statusPill: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, fontSize: typography.caption, fontFamily: 'Poppins_600SemiBold' }, 
  danger: { color: colors.alertInk, backgroundColor: colors.alertSoft }, 
  pending: { color: colors.warningInk, backgroundColor: colors.warningSoft }, 
  closed: { color: colors.successInk, backgroundColor: colors.successSoft }, 
  time: { fontSize: typography.caption, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }, 
  section: { fontSize: typography.body, fontFamily: 'Poppins_600SemiBold', marginTop: 15, marginBottom: 7 }, 
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.card, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 , ...alertLayout.card }, 
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, smallPhoto: { width: 45, height: 45, borderRadius: 23, backgroundColor: colors.border }, 
  cardTitle: { fontSize: typography.detail, fontFamily: 'Poppins_600SemiBold' }, 
  note: { fontSize: typography.caption, color: colors.textSecondary, fontFamily: 'Poppins_400Regular', lineHeight: Math.ceil(typography.caption * 1.5) }, 
  mapButton: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 8, paddingVertical: 7, alignItems: 'center', marginTop: 10 }, 
  mapText: { color: colors.primary, fontFamily: 'Poppins_500Medium', fontSize: typography.caption },
  assigned: { color: colors.successInk, fontSize: typography.caption, fontFamily: 'Poppins_600SemiBold', marginTop: 3 }, 
  assignButton: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 9, paddingVertical: 9, alignItems: 'center', marginTop: 10 }, 
  assignText: { color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: typography.caption }, 
  cantReachButton: { borderWidth: 1, borderColor: colors.alertInk, backgroundColor: colors.alertSoft, borderRadius: 9, paddingVertical: 9, alignItems: 'center', marginTop: 10, paddingHorizontal: 14 },
  cantReachText: { color: colors.alertInk, fontFamily: 'Poppins_600SemiBold', fontSize: typography.caption },
  
  confirmCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, paddingVertical: 6, paddingBottom: 10, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 , ...alertLayout.card }, 
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }, 
  confirmLabel: { fontSize: typography.caption, fontFamily: 'Poppins_500Medium' }, 
  confirmPill: { minWidth: 90, textAlign: 'center', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4, fontSize: typography.caption, fontFamily: 'Poppins_600SemiBold' }, 
  waiting: { color: colors.warningInk, backgroundColor: colors.warningSoft }, 
  safe: { color: colors.successInk, backgroundColor: colors.successSoft }, 
  notSafe: { color: colors.alertInk, backgroundColor: colors.alertSoft }, 
  actionNotice: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: 10, padding: 11, marginBottom: 8 },
  actionNoticeText: { flex: 1, marginLeft: 9, fontSize: typography.caption, lineHeight: Math.ceil(typography.caption * 1.5), fontFamily: 'Poppins_400Regular', color: colors.textSecondary },
  
  escalationCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.alertInk, backgroundColor: colors.alertSoft, borderRadius: 12, padding: 13, marginTop: 15 }, 
  escalationTitle: { fontSize: typography.detail, color: colors.alertInk, fontFamily: 'Poppins_600SemiBold' },   
  closedCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.successInk, backgroundColor: colors.successSoft, borderRadius: 12, padding: 13, marginTop: 15 },
  closedTitle: { fontSize: typography.detail, color: colors.successInk, fontFamily: 'Poppins_600SemiBold' },

  discrepancyCard: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: colors.alertBorder, backgroundColor: colors.alertSoft, borderRadius: 12, padding: 12, marginBottom: 8 }, 
  readOnlyNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSunken, borderRadius: 10, padding: 11, marginTop: 15, marginBottom: -10 },
  readOnlyText: { flex: 1, fontSize: typography.caption, lineHeight: Math.ceil(typography.caption * 1.5), fontFamily: 'Poppins_400Regular', color: colors.textSecondary, marginLeft: 12 },

  summaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 10, backgroundColor: colors.primarySoft, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  summaryButtonText: { color: colors.primary, fontSize: typography.detail, fontFamily: 'Poppins_500Medium' },
});