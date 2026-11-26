// Digital Bayanihan header: a compact Bayanihan Blue band whose lower edge
// flows into the warm page canvas, with a lighter secondary wave behind it
// (same curve as the website header and the email header).
//
// Two layouts:
//   <BrandHeader actions={[...]} />                    dashboards: logo + barangay
//   <BrandHeader title="Resident profile" onBack={fn} /> detail screens
//
// Render it outside the screen's SafeAreaView top edge: it pads itself for
// the status bar so the blue runs to the top of the screen.
import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import Text from './AppText';
import { colors, brandDots, font, typography, spacing } from '../constants/theme';

export const BARANGAY_LABEL = 'Barangay 206, Tondo, Manila';

export function BrandDots({ size = 10, gap = 6, style }) {
  return <View style={[{ flexDirection: 'row', gap }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
    {brandDots.map((color) => <View key={color} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />)}
  </View>;
}

// The website curve, plus an optional lighter wave just above it.
export function BrandCurve({ color = colors.background, height = 28, wave = true }) {
  return <Svg width="100%" height={height} viewBox="0 0 1440 80" preserveAspectRatio="none" style={styles.curve} accessible={false}>
    {wave && <Path d="M0 30C260 0 520 50 760 36S1180 46 1440 8V80H0Z" fill="#5FB3E0" opacity={0.55} />}
    <Path d="M0 46C240 14 480 60 720 52S1200 70 1440 24V80H0Z" fill={color} />
  </Svg>;
}

function HeaderAction({ icon, label, onPress, badge }) {
  return <TouchableOpacity style={styles.action} onPress={onPress} accessibilityRole="button"
    accessibilityLabel={badge ? `${label}, ${badge} open` : label} activeOpacity={0.75} hitSlop={4}>
    <FontAwesome5 name={icon} size={18} color={colors.primary} solid />
    {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}
  </TouchableOpacity>;
}

export default function BrandHeader({ title, subtitle, onBack, actions = [] }) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  return <View style={[styles.band, { paddingTop: insets.top + 8 }]}>
    {focused && <StatusBar style="light" />}
    <View style={styles.row}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={6}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.onPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.logoWrap}>
          <Image source={require('../assets/logo.png')} style={styles.logo} accessible={false} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        {title ? (
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{title}</Text>
        ) : (
          <Text style={styles.barangay} numberOfLines={1}>Barangay 206</Text>
        )}
        {subtitle || !title ? <Text style={styles.sub} numberOfLines={1}>{subtitle || 'Tondo, Manila · QRAlalay'}</Text> : null}
      </View>
      {actions.map((action) => <HeaderAction key={action.label} {...action} />)}
    </View>
    <BrandCurve height={26} />
  </View>;
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.brand, paddingHorizontal: spacing.screen - 6, paddingBottom: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  logoWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.onPrimary, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 32, height: 32 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  barangay: { color: colors.onPrimary, fontFamily: font.semibold, fontSize: typography.detail },
  title: { color: colors.onPrimary, fontFamily: font.bold, fontSize: typography.body + 2, letterSpacing: -0.3 },
  sub: { color: '#DCEFFA', fontFamily: font.regular, fontSize: typography.caption },
  action: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.onPrimary, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: colors.alertInk, borderWidth: 2, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 11, lineHeight: 14 },
  curve: { position: 'absolute', left: 0, right: 0, bottom: -1 },
});
