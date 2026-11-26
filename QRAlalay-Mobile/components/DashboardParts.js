// Dashboard building blocks shared by the official, guardian and responder
// home screens: a greeting that sits below the compact header, and the
// overview boxes (equal-sized, soft semantic colours, real counts only).
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import Text from './AppText';
import CommunityIllustration from './CommunityIllustration';
import { colors, font, typography, radius } from '../constants/theme';

export function Greeting({ name, role }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'Kapitbahay';
  return <View style={styles.greeting}>
    <View style={{ flex: 1 }}>
      <Text style={styles.hello} accessibilityRole="header">Magandang araw, {first}!</Text>
      {role ? <Text style={styles.role}>{role}</Text> : null}
    </View>
    <CommunityIllustration width={118} height={66} />
  </View>;
}

const TONES = {
  red: { bg: colors.alertSoft, border: colors.alertBorder, icon: colors.alert },
  yellow: { bg: colors.warningSoft, border: '#F5DE9A', icon: '#E0A100' },
  green: { bg: colors.successSoft, border: '#C3E3B2', icon: '#4FA33A' },
  blue: { bg: colors.primarySoft, border: colors.primaryBorder, icon: colors.brand },
};

export function StatGrid({ items }) {
  return <View style={styles.grid}>
    {items.map((item) => {
      const tone = TONES[item.tone] || TONES.blue;
      return <TouchableOpacity key={item.label} onPress={item.onPress} disabled={!item.onPress} activeOpacity={0.75}
        style={[styles.stat, { backgroundColor: tone.bg, borderColor: tone.border }]}
        accessibilityRole={item.onPress ? 'button' : undefined} accessibilityLabel={`${item.label}: ${item.count}`}>
        <FontAwesome5 name={item.icon} size={22} color={tone.icon} solid />
        <Text style={styles.count}>{item.count}</Text>
        <Text style={styles.label}>{item.label}</Text>
      </TouchableOpacity>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  greeting: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 14 },
  hello: { fontFamily: font.bold, fontSize: typography.section, color: colors.textPrimary, letterSpacing: -0.3, lineHeight: 30 },
  role: { fontFamily: font.regular, fontSize: typography.caption + 1, color: colors.textSecondary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  stat: { flexGrow: 1, flexBasis: '30%', minWidth: 96, minHeight: 112, borderRadius: radius.lg, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  count: { fontFamily: font.bold, fontSize: 28, lineHeight: 36, color: colors.textPrimary, fontVariant: ['tabular-nums'], marginTop: 4 },
  label: { fontFamily: font.medium, fontSize: typography.caption, lineHeight: 18, color: colors.textPrimary, textAlign: 'center' },
});
