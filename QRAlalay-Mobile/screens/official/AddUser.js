import { typography, spacing, colors } from '../../constants/theme';
import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput } from 'react-native';
import Text from "../../components/AppText";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dropdown } from 'react-native-element-dropdown';
import { useAppData } from "../../contexts/AppDataContext";
import { Field } from "../../components/ui";

const ROLES = [
  { label: 'Guardian', value: 'Guardian' },
  { label: 'Barangay Responder', value: 'Barangay Responder' },
  { label: 'Barangay Official', value: 'Barangay Official' },
];

const POSITIONS = [
  { label: 'Barangay Captain', value: 'Barangay Captain' },
  { label: 'Barangay Secretary', value: 'Barangay Secretary' },
  { label: 'Barangay Kagawad', value: 'Barangay Kagawad' },
];

export default function AddUser({ route, navigation }) {
  const { addUser, account } = useAppData();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '', role: route.params?.role || 'Guardian', position: 'Barangay Secretary',
    barangay: account.barangayName || '', address: '',
  });

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ');

  async function handleCreate() {
    if (submitting) return;
    // Sign-in is by email code (phone sign-in is not configured), so the
    // email is required and the mobile number is optional contact detail.
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      Alert.alert('Missing information', 'Please enter the full name and email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (form.phone && !/^9\d{9}$/.test(form.phone)) {
      Alert.alert('Invalid phone number', 'Enter 10 digits starting with 9. The +63 prefix is added automatically.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await addUser({
        name: fullName,
        phone: form.phone ? `+63${form.phone}` : '',
        email: form.email.trim(),
        role: form.role,
        position: form.role === 'Barangay Official' ? form.position : '',
        barangay: form.barangay,
        address: form.address.trim(),
        status: 'Active',
      });

      Alert.alert(
        'User created',
        `Supabase Auth accepted the invitation request for ${form.email.trim()}; this does not confirm inbox delivery. Ask ${fullName} to check inbox and spam and open the separate invitation link. The account stays inactive until the email is confirmed and an official activates it.${form.role === 'Guardian' ? ' Link wards from each resident\'s profile.' : ''}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Could not create user', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Back</Text>
        <Text style={styles.heading}>ADD USER ACCOUNT</Text>
        <Text style={styles.subheading}>step 1 : Personal Information</Text>
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressBarActive]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Field label="Enter First Name" required value={form.firstName} onChangeText={(v) => update('firstName', v)} />
        <Field label="Enter Last Name" required value={form.lastName} onChangeText={(v) => update('lastName', v)} />
        <Field label="Email Address" required value={form.email} onChangeText={(v) => update('email', v)} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        <Text style={styles.fieldLabel}>Phone Number (optional)</Text>
        <View style={styles.phoneRow}>
            <View style={styles.countryCode}><Text style={styles.countryCodeText}>+63</Text></View>
            <TextInput style={styles.phoneInput} placeholder="9XX-XXX-XXXX" keyboardType="number-pad" maxLength={10} value={form.phone} onChangeText={(v) => update('phone', v.replace(/[^0-9]/g, ''))} />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Select User Role<Text style={styles.required}>*</Text></Text>
          <Dropdown
            style={styles.pickerWrap}
            placeholderStyle={styles.dropdownPlaceholder}
            selectedTextStyle={styles.dropdownText}
            itemTextStyle={styles.dropdownText}
            fontFamily="Poppins_400Regular"
            data={ROLES}
            labelField="label"
            valueField="value"
            placeholder="Kindly select type"
            value={form.role}
            onChange={(item) => update('role', item.value)}
            iconColor={colors.textSecondary}
          />
        </View>

        {form.role === 'Barangay Official' && (
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Position</Text>
            <Dropdown
              style={styles.pickerWrap}
              placeholderStyle={styles.dropdownPlaceholder}
              selectedTextStyle={styles.dropdownText}
              itemTextStyle={styles.dropdownText}
              fontFamily="Poppins_400Regular"
              data={POSITIONS}
              labelField="label"
              valueField="value"
              placeholder="Kindly select position"
              value={form.position}
              onChange={(item) => update('position', item.value)}
              iconColor={colors.textSecondary}
            />
          </View>
        )}


        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Barangay</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyFieldText}>{form.barangay}</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.button, styles.shadow]} disabled={submitting} onPress={handleCreate}>
          <Text style={styles.buttonText}>{submitting ? 'Creating...' : 'Create User'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screen, paddingBottom: 0, paddingTop: 4 },
  scrollContent: { padding: spacing.screen, paddingTop: 0, paddingBottom: 30 },
  back: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.primary, marginBottom: 4, minHeight: 44, paddingVertical: 4, marginTop: 0 },
  heading: { fontSize: typography.title, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },
  subheading: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, marginBottom: 8 },
  progressRow: { flexDirection: 'row', marginBottom: 24 },
  progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, marginRight: 6 },
  progressBarActive: { backgroundColor: colors.primary },
  fieldWrap: { marginBottom: spacing.field },
  fieldLabel: { fontSize: typography.body, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, marginBottom: 10 },
  required: { color: colors.alertInk },
  pickerWrap: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.surfaceSunken, justifyContent: 'center', height: spacing.control },
  dropdownPlaceholder: { fontFamily: 'Poppins_400Regular', fontSize: typography.body, color: colors.textMuted },
  dropdownText: { fontFamily: 'Poppins_400Regular', fontSize: typography.body, color: colors.textPrimary },
  readOnlyField: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.border, justifyContent: 'center', height: spacing.control },
  readOnlyFieldText: { fontFamily: 'Poppins_400Regular', fontSize: typography.body, color: colors.textPrimary },
  phoneRow: { flexDirection: 'row', marginBottom: spacing.field  },
  countryCode: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center', marginRight: 8, backgroundColor: colors.surfaceSunken },
  countryCodeText: { fontSize: typography.body, fontWeight: '600' },
  phoneInput: { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 12, backgroundColor: colors.surfaceSunken, fontSize: typography.body, fontFamily: 'Poppins_400Regular', minHeight: spacing.control },  
  shadow: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0, shadowRadius: 4, elevation: 0 },
  button: { borderRadius: 10, backgroundColor: colors.primarySoft, paddingVertical: 16, alignItems: 'center', marginTop: 10, marginBottom: 8, minHeight: spacing.control, justifyContent: 'center' },
  buttonText: { color: colors.primary, fontSize: typography.body, fontFamily: 'Poppins_500Medium' },
  cancelButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 10, minHeight: spacing.control, justifyContent: 'center' },
  cancelText: { color: colors.primary, fontSize: typography.body, fontFamily: 'Poppins_500Medium' },
});
