import { typography, spacing, colors } from '../../constants/theme';
import Avatar from "../../components/Avatar";
import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Text from "../../components/AppText";
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import TabBar from "../../components/tabs/TabButtons";
import { useAppData } from "../../contexts/AppDataContext";
import ReasonPromptModal from "../../components/modals/ReasonPromptModal";


export default function AssignResponder({ route, navigation }) {
  const { alerts, users, assignResponder, account } = useAppData();
  const alert = alerts.find((item) => item.id === (route.params?.alertId || route.params?.incidentId));
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reasonPrompt, setReasonPrompt] = useState(false);
  // A pending or accepted assignment must be replaced with a recorded reason.
  const isReassign = !!alert?.responderId && ['pending_acceptance', 'accepted'].includes(alert?.assignment_status);

  // Availability uses only what the server tracks: whether the account is
  // active (inactive accounts are rejected) and how many open cases the
  // responder already holds. There are no duty schedules in the backend.
  const responders = useMemo(() => users
    .filter((user) => user.role === 'Barangay Responder')
    .map((user) => {
      const openCases = alerts.filter(
        (item) => item.id !== alert?.id && item.responderId === user.id && item.status !== 'closed'
      ).length;
      const current = user.id === alert?.responderId && isReassign;
      const inactive = user.status !== 'Active';
      const availability = current ? 'Currently assigned'
        : inactive ? 'Account inactive'
        : openCases ? `${openCases} open assignment${openCases === 1 ? '' : 's'}`
        : 'No open assignments';
      return { ...user, availability, selectable: !current && !inactive, idle: !current && !inactive && !openCases };
    }), [users, alerts, alert?.id, alert?.responderId, isReassign]);
  if (!alert) return <SafeAreaView><Text onPress={() => navigation.goBack()}>‹ Back</Text><Text>Request not found.</Text></SafeAreaView>;

  async function assign(reason = null) {
    setSubmitting(true);
    try {
      const reassigned = isReassign;
      await assignResponder(alert.id, selected.id, reason);
      setReasonPrompt(false);
      Alert.alert(reassigned ? 'Responder reassigned' : 'Responder assigned', `${selected.name} was notified and must accept the assignment.`);
      navigation.navigate('AlertDetails', { alertId: alert.id });
    }
    catch (err) { Alert.alert(isReassign ? 'Could not reassign responder' : 'Could not assign responder', err.message); }
    finally { setSubmitting(false); }
  }

  function handleConfirm() {
    if (submitting) return;
    if (!selected) {
      Alert.alert('Select a responder', 'Please select a responder first.');
      return;
    }
    if (isReassign) { setReasonPrompt(true); return; }
    assign();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>
        <Text style={styles.heading}>{isReassign ? 'Reassign Responder' : 'Assign Responder'}</Text>
        <Text style={styles.subheading}>{isReassign ? `Currently assigned: ${alert.responderName || 'a responder'}. Choose a replacement.` : 'Select an available responder for this alert.'}</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.residentCard, styles.shadow]}>
          <Avatar uri={alert.residentPhotoUrl} name={alert.residentName} style={styles.residentPhoto} />
          <View style={{ flex: 1, margin: 0 }}>
            <Text style={styles.contextTitle}>{alert.residentName}</Text>
            <Text style={styles.small}>Type: {alert.residentType}</Text>
          </View>
        </View>

        <View style={styles.contextCard}>
          <Text style={styles.contextTitle}> <FontAwesome5 name="map-marker-alt" size={16} color={colors.primary} />  Reported location
          </Text>
          <Text style={styles.contextText}>{alert.location}</Text>
          <Text style={styles.contextTitle}>
            <FontAwesome5 name="comment-medical" size={16} color={colors.primary} />  Bystander Note
          </Text>
          <Text style={[styles.contextText, {marginBottom: 0}]}>{alert.bystanderNote || 'No note submitted.'}</Text>
        </View>

        <Text style={styles.section}>Responders</Text>
        {responders.map((responder) => {
          const available = responder.selectable;
          const isSelected = selected?.id === responder.id;
          return (
            <TouchableOpacity
              key={responder.id}
              disabled={!available}
              style={[
                styles.responderCard,
                !available && styles.disabledCard,
                isSelected && styles.selectedCard,
              ]}
              onPress={() => setSelected(responder)}
              activeOpacity={0.8}
            >
              <Avatar uri={responder.photoUrl} name={responder.name} style={styles.photo} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{responder.name}</Text>
                <Text style={styles.small}>Barangay Responder</Text>
                <Text style={[styles.availability, responder.idle ? styles.available : styles.unavailable]}>
                  ● {responder.availability}
                </Text>
              </View>
              <FontAwesome5
                name={isSelected ? 'dot-circle' : 'circle'}
                size={19}
                color={isSelected ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      
      <View style={styles.buttonContent}>
        <TouchableOpacity
          style={[styles.assignButton, !selected && styles.assignDisabled]}
          disabled={submitting || !selected}
          onPress={handleConfirm}
        >
          <Text style={styles.assignButtonText}>{submitting ? 'Saving…' : isReassign ? 'Reassign Responder' : 'Assign Responder'}</Text>
        </TouchableOpacity>
      </View>
      <ReasonPromptModal visible={reasonPrompt} title="Why are you reassigning this alert?"
        placeholder="e.g. first responder cannot reach the location" confirmLabel="Reassign" submitting={submitting}
        onCancel={() => setReasonPrompt(false)} onSubmit={assign} />      
      <TabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screen, paddingBottom: 0, paddingTop: 4 },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.screen, paddingTop: 8, paddingBottom: 20 },
  buttonContent: { paddingHorizontal: 20, paddingVertical: 12, justifyContent: 'flex-end' },
  back: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.primary, marginBottom: 4, marginTop: 0, minHeight: 44, paddingVertical: 4 },
  heading: { fontSize: typography.title, fontFamily: 'Poppins_700Bold', marginTop: -8, marginBottom: 0 }, 
  subheading: { fontSize: typography.detail, fontFamily: 'Poppins_500Medium', color: colors.textSecondary }, 
  
  residentCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 12, backgroundColor: colors.primarySoft, padding: spacing.card, marginBottom: 16 },
  residentPhoto: { width: 85, height: 100, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.border, marginRight: 11 },
  photo: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.border, marginRight: 11 },
  cardTitle: { fontSize: typography.detail, fontFamily: 'Poppins_600SemiBold' },
  small: { fontSize: typography.caption, color: colors.textSecondary, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  contextCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, backgroundColor: colors.surface },
  contextTitle: { fontSize: typography.detail, fontFamily: 'Poppins_600SemiBold' },
  contextText: { fontSize: typography.caption, color: colors.textSecondary, fontFamily: 'Poppins_400Regular', marginBottom: 9, marginTop: 3, marginLeft: 10 },
  section: { fontSize: typography.body, fontFamily: 'Poppins_600SemiBold', marginTop: 15, marginBottom: 7 },
  shadow: { shadowColor: colors.shadow, shadowOffset: { width: 2, height: 4 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 },

  responderCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 9, backgroundColor: colors.surface },
  selectedCard: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  disabledCard: { backgroundColor: colors.border, opacity: 0.7 },
  availability: { fontSize: typography.caption, fontFamily: 'Poppins_500Medium', marginTop: 3 },
  available: { color: colors.successInk },
  unavailable: { color: colors.primary },
  
  assignButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 10, backgroundColor: colors.primarySoft, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  assignButtonText: { color: colors.primary, fontSize: typography.detail, fontFamily: 'Poppins_500Medium' },  
  assignDisabled: { opacity: 0.5 },

  successContent: { padding: 20, alignItems: 'stretch' },
  successIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.successInk, alignSelf: 'center', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  successTitle: { fontSize: typography.title, fontFamily: 'Poppins_700Bold', textAlign: 'center', marginTop: 15 },
  successText: { fontSize: typography.detail, color: colors.textSecondary, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 3, marginBottom: 15 },
  successCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 },
  notice: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 10, padding: 12, marginTop: 12 },
  noticeText: { flex: 1, fontSize: typography.caption, color: colors.primary, fontFamily: 'Poppins_400Regular', marginLeft: 8 },
  
  primaryButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 20, minHeight: spacing.control, justifyContent: 'center' },
  primaryText: { color: colors.onPrimary, fontFamily: 'Poppins_600SemiBold' },
  secondaryButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 9, minHeight: spacing.control, justifyContent: 'center' },
  secondaryText: { color: colors.primary, fontFamily: 'Poppins_500Medium' },
});

