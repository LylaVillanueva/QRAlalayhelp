import { typography, spacing, colors } from '../../constants/theme';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import Text from "../../components/AppText";
import TextInput from "../../components/AppTextInput";
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api } from '../../services/api';
import ScreenState from "../../components/ScreenState";

const PUBLIC_STATUS = { new: 'New Request', in_progress: 'In Progress', escalated: 'Escalated', closed: 'Closed' };

export default function BystanderPublicWeb({ route, navigation }) {
  const token = route.params?.token;
  const [resident, setResident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [landmark, setLandmark] = useState('');
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setResident(null); setError(null); setSubmitted(false); setNote(''); setLandmark(''); setStatus(null);
    setResult(null); setCancelled(false); setSecondsLeft(0);
    if (!token) { setError('Please scan a current QR card issued by your barangay.'); setLoading(false); return; }
    api.getPublicQrView(token).then((data) => { if (active) setResident(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!result?.cancelToken || cancelled) { setSecondsLeft(0); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(result.cancellableUntil).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [result, cancelled]);

  async function cancelAlert() {
    if (cancelling || !result?.cancelToken) return;
    setCancelling(true);
    try {
      const response = await api.cancelQrScan(result.cancelToken);
      if (response?.cancelled) setCancelled(true);
      else {
        setResult((current) => ({ ...current, cancelToken: null }));
        Alert.alert('Cannot cancel', 'This alert can no longer be cancelled. Contact the barangay if it was a mistake.');
      }
    } catch (err) { Alert.alert('Could not cancel alert', err.message); }
    finally { setCancelling(false); }
  }

  // Location is captured once, only when the request is sent, and only with permission.
  async function submitRequest() {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      let coordinates = {};
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.granted) {
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          coordinates = { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracyMeters: location.coords.accuracy ?? null };
        }
      } catch { /* A bystander can request assistance without location permission. */ }
      setResult(await api.recordQrScan(token, {
        ...coordinates, bystanderNotes: note.trim(), locationDescription: landmark.trim() || null,
      }));
      setSubmitted(true);
    } catch (err) { Alert.alert('Could not send the request', err.message); }
    finally { setSubmitting(false); }
  }

  async function checkStatus() {
    if (checking || !result?.cancelToken) return;
    setChecking(true);
    try { setStatus(await api.getPublicAssistanceStatus(result.cancelToken)); }
    catch (err) { Alert.alert('Could not check status', err.message); }
    finally { setChecking(false); }
  }

  async function call(number) {
    try { await Linking.openURL(`tel:${number.replace(/[^+\d]/g, '')}`); }
    catch { Alert.alert('Unable to call', `Please dial ${number} on your phone.`); }
  }

  if (loading || error || !resident) return <ScreenState loading={loading} error={error} onBack={navigation?.canGoBack() ? navigation.goBack : undefined} />;
  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      {navigation?.canGoBack() && <Text style={[styles.link, { paddingVertical: 4, minHeight: 44 }]} onPress={() => navigation.goBack()}>‹ Back</Text>}
      <Text style={styles.title}>QRAlalay</Text>
      <Text style={styles.subtitle}>Help a resident</Text>
      <Text style={styles.body}>Valid resident card{resident.barangayName ? ` · Barangay ${resident.barangayName}` : ''}</Text>
      {/* Shown only when the barangay approved public disclosure for this resident. */}
      {resident.displayName ? <Text style={styles.body}>Name: {resident.displayName}</Text> : null}
      {resident.assistanceInstructions ? <Text style={styles.body}>How to help: {resident.assistanceInstructions}</Text> : null}
      {submitted ? <View>
        <Text style={styles.subtitle}>{cancelled ? 'Your request was cancelled. The barangay may already have been notified.' : 'Your assistance request was sent to the barangay.'}</Text>
        {!cancelled && <Text style={styles.body}>This does not contact emergency services. Call 911 if anyone is in immediate danger.</Text>}
        {status ? <Text style={styles.body}>Status: {status.cancelled ? 'Cancelled' : PUBLIC_STATUS[status.status] || 'Received'}</Text> : null}
        {!cancelled && <TouchableOpacity style={styles.secondaryButton} disabled={checking} onPress={checkStatus}>
          <Text style={styles.secondaryText}>{checking ? 'Checking…' : 'Check request status'}</Text>
        </TouchableOpacity>}
        {!cancelled && secondsLeft > 0 && <TouchableOpacity style={styles.secondaryButton} disabled={cancelling} onPress={cancelAlert}>
          <Text style={styles.secondaryText}>{cancelling ? 'Cancelling…' : `Cancel mistaken request (${secondsLeft}s)`}</Text>
        </TouchableOpacity>}
      </View> : <View>
        <Text style={styles.body}>Send an assistance request to the barangay. When you tap Request Assistance, your current location is shared once if you allow it.</Text>
        <TextInput style={[styles.input, styles.shortInput]} maxLength={300} value={landmark} onChangeText={setLandmark} placeholder="Where is the resident? Landmark (optional)" />
        <TextInput style={styles.input} multiline maxLength={1000} value={note} onChangeText={setNote} placeholder="What happened? (optional)" />
        <TouchableOpacity style={styles.button} disabled={submitting} onPress={submitRequest} accessibilityRole="button"><Text style={styles.buttonText}>{submitting ? 'Sending…' : 'Request Assistance'}</Text></TouchableOpacity>
      </View>}
      <Text style={styles.subtitle}>Need immediate help?</Text>
      {(resident.contacts || []).slice(0, 1).map((contact) => (
        <TouchableOpacity key={contact.phone} style={styles.secondaryButton} onPress={() => call(contact.phone)} accessibilityRole="button">
          <Text style={styles.secondaryText}>Call Barangay · {contact.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.secondaryButton} onPress={() => call('911')} accessibilityRole="button"><Text style={styles.secondaryText}>Call 911</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.screen, paddingTop: 4, gap: 16, maxWidth: 600, width: '100%', alignSelf: 'center' },
  title: { fontSize: typography.title, fontFamily: 'Poppins_700Bold', color: colors.primary , marginBottom: 8 }, subtitle: { fontSize: typography.body, fontFamily: 'Poppins_600SemiBold', marginVertical: 12 },
  button: { padding: 16, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', marginVertical: 12 , minHeight: spacing.control, justifyContent: 'center' }, buttonText: { fontSize: typography.body, color: colors.surface, fontFamily: 'Poppins_600SemiBold' },
  body: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', lineHeight: 27 },
  secondaryButton: { padding: 14, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 12, alignItems: 'center', marginVertical: 6, minHeight: spacing.control, justifyContent: 'center' },
  secondaryText: { fontSize: typography.body, color: colors.primary, fontFamily: 'Poppins_600SemiBold' },
  shortInput: { minHeight: 56 },
  input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, padding: 16, minHeight: 120, marginTop: 16, textAlignVertical: 'top' , fontSize: typography.body, backgroundColor: colors.surfaceSunken },
});
