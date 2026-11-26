// One QR card presentation for every resident category (used by the resident
// profile and by the enrollment confirmation). Only the resident's own
// details and category label differ. The QR stays dark-on-white with a
// generous quiet zone, and nothing is drawn over the pattern.
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { FontAwesome5 } from '@expo/vector-icons';
import Text from './AppText';
import { colors, font, typography, radius } from '../constants/theme';

// Same error-correction level everywhere so cards look and scan alike.
export const QR_ECL = 'Q';

export default function QrCardPanel({ value, qrRef, name, category, details = [], children }) {
  return <View style={styles.panel}>
    <View style={styles.headingRow}>
      <FontAwesome5 name="qrcode" size={18} color={colors.primary} />
      <Text style={styles.heading} accessibilityRole="header">Resident QR card</Text>
    </View>
    <View style={styles.qrWell} accessible accessibilityRole="image" accessibilityLabel={value ? `QR card for ${name || 'resident'}` : undefined}>
      {value
        ? <QRCode value={value} size={220} ecl={QR_ECL} color="#000000" backgroundColor="#FFFFFF" quietZone={12} getRef={(node) => { if (qrRef) qrRef.current = node; }} />
        : children}
    </View>
    {name ? <Text style={styles.name}>{name}</Text> : null}
    {category ? <Text style={styles.category}>{category}</Text> : null}
    {details.filter(Boolean).map((line) => <Text key={line} style={styles.detail}>{line}</Text>)}
  </View>;
}

const VARIANTS = {
  save: { bg: colors.primary, border: colors.primary, fg: colors.onPrimary, icon: 'download' },
  share: { bg: colors.successSoft, border: '#B5DCA4', fg: colors.successInk, icon: 'share-alt' },
  replace: { bg: colors.warningSoft, border: '#F2D27C', fg: colors.warningInk, icon: 'sync-alt' },
  revoke: { bg: colors.alertSoft, border: colors.alertBorder, fg: colors.alertInk, icon: 'ban' },
  secondary: { bg: colors.primarySoft, border: colors.primaryBorder, fg: colors.primary, icon: 'user' },
};

export function QrAction({ variant = 'save', label, onPress, disabled }) {
  const v = VARIANTS[variant];
  return <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
    style={[styles.action, { backgroundColor: v.bg, borderColor: v.border }, disabled && { opacity: 0.55 }]}>
    <FontAwesome5 name={v.icon} size={16} color={v.fg} />
    <Text style={[styles.actionText, { color: v.fg }]}>{label}</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: radius.xl, padding: 18, alignItems: 'center' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 14 },
  heading: { fontFamily: font.bold, fontSize: typography.body, color: colors.textPrimary },
  qrWell: { backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border, minWidth: 244, minHeight: 244, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.bold, fontSize: typography.section, color: colors.textPrimary, textAlign: 'center', marginTop: 14, letterSpacing: -0.3 },
  category: { fontFamily: font.semibold, fontSize: typography.caption, color: colors.primary, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginTop: 6, overflow: 'hidden' },
  detail: { fontFamily: font.regular, fontSize: typography.caption + 1, color: colors.textSecondary, textAlign: 'center', marginTop: 6 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 16, marginTop: 10 },
  actionText: { fontFamily: font.semibold, fontSize: typography.detail },
});
