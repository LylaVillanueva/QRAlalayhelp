// One QR card presentation for every resident category (used by the resident
// profile and by the enrollment confirmation). Only the resident's own
// details and category label differ. The QR stays dark-on-white with a
// generous quiet zone; only the centred logo (covered by high error
// correction) sits over the pattern, never the corner finder squares.
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { FontAwesome5 } from '@expo/vector-icons';
import Text from './AppText';
import { colors, font, typography, radius } from '../constants/theme';

// High error correction (H, ~30% recoverable) because the logo covers the
// centre. The logo plus its white margin covers about 6% of the symbol, well
// inside that budget, and the finder patterns in the corners stay clear.
export const QR_ECL = 'H';
const QR_SIZE = 220;
const LOGO_SIZE = Math.round(QR_SIZE * 0.2);

export default function QrCardPanel({ value, qrRef, code, children }) {
  return <View style={styles.panel}>
    <View style={styles.headingRow}>
      <FontAwesome5 name="qrcode" size={18} color={colors.primary} />
      <Text style={styles.heading} accessibilityRole="header">Resident QR card</Text>
    </View>
    <View style={styles.qrWell} accessible accessibilityRole="image" accessibilityLabel={value ? 'Resident QR card' : undefined}>
      {value
        ? <QRCode value={value} size={QR_SIZE} ecl={QR_ECL} color="#000000" backgroundColor="#FFFFFF" quietZone={12}
            logo={require('../assets/logo.png')} logoSize={LOGO_SIZE} logoMargin={3} logoBackgroundColor="#FFFFFF" logoBorderRadius={8}
            getRef={(node) => { if (qrRef) qrRef.current = node; }} />
        : children}
    </View>
    {code ? <Text style={styles.code}>QRAlalay ID: <Text style={styles.codeValue}>{code}</Text></Text> : null}
  </View>;
}

// Name, photo and category above the QR card, as in the design concept.
export function QrOwnerSummary({ name, category, photo }) {
  return <View style={styles.owner}>
    {photo}
    <View style={{ flex: 1 }}>
      <Text style={styles.name}>{name}</Text>
      {category ? <Text style={styles.category}>{category}</Text> : null}
    </View>
  </View>;
}

// Save PDF on its own row, then Replace and Revoke side by side.
export function QrActionGrid({ children }) {
  return <View style={styles.grid}>{children}</View>;
}

const VARIANTS = {
  save: { bg: '#D6EBF7', border: colors.primaryBorder, fg: colors.primaryDark, icon: 'download' },
  share: { bg: colors.successSoft, border: '#B5DCA4', fg: colors.successInk, icon: 'share-alt' },
  replace: { bg: colors.warningSoft, border: '#F2D27C', fg: colors.warningInk, icon: 'sync-alt' },
  revoke: { bg: colors.alertSoft, border: colors.alertBorder, fg: colors.alertInk, icon: 'ban' },
  secondary: { bg: colors.primarySoft, border: colors.primaryBorder, fg: colors.primary, icon: 'user' },
};

export function QrAction({ variant = 'save', label, onPress, disabled, half }) {
  const v = VARIANTS[variant];
  return <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
    style={[styles.action, half && styles.half, { backgroundColor: v.bg, borderColor: v.border }, disabled && { opacity: 0.55 }]}>
    <FontAwesome5 name={v.icon} size={16} color={v.fg} />
    <Text style={[styles.actionText, { color: v.fg }]}>{label}</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: radius.xl, padding: 18, alignItems: 'center' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 14 },
  heading: { fontFamily: font.bold, fontSize: typography.body, color: colors.textPrimary },
  qrWell: { backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.border, minWidth: 244, minHeight: 244, alignItems: 'center', justifyContent: 'center' },
  code: { fontFamily: font.regular, fontSize: typography.caption + 1, color: colors.textSecondary, marginTop: 12 },
  codeValue: { fontFamily: font.semibold, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14, marginBottom: 12,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  name: { fontFamily: font.bold, fontSize: typography.body + 2, color: colors.textPrimary, letterSpacing: -0.3, lineHeight: 26 },
  category: { alignSelf: 'flex-start', fontFamily: font.semibold, fontSize: typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginTop: 6, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 12, flexBasis: '100%', flexGrow: 1 },
  half: { flexBasis: '45%' },
  actionText: { fontFamily: font.semibold, fontSize: typography.detail },
});
