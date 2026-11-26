// Digital Bayanihan header shared by the welcome screen and the three role
// dashboards: Bayanihan Blue band, a soft organic curve into the warm page
// canvas, and the four-colour motif from the logo. Same shape as the website
// header (QRAlalay-Web/src/components/PageLayout.jsx) and the email header.
import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import Text from './AppText';
import Avatar from './Avatar';
import { colors, brandDots, font, typography, spacing, tracking } from '../constants/theme';

export function BrandDots({ size = 10, gap = 6, style }) {
  return <View style={[{ flexDirection: 'row', gap }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
    {brandDots.map((color) => <View key={color} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />)}
  </View>;
}

// The website curve path, scaled to the device width.
export function BrandCurve({ color = colors.background, height = 28 }) {
  return <Svg width="100%" height={height} viewBox="0 0 1440 80" preserveAspectRatio="none" style={styles.curve} accessible={false}>
    <Path d="M0 46C240 14 480 60 720 52S1200 70 1440 24V80H0Z" fill={color} />
  </Svg>;
}

// Dashboard header: greeting, name and role on blue, with the user's photo.
// Render it outside the screen's SafeAreaView top edge: it pads itself for
// the status bar so the blue runs to the top of the screen.
export default function BrandHeader({ name, role, barangay, photoUrl, children }) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  return <View style={[styles.band, { paddingTop: insets.top + 12 }]}>
    {focused && <StatusBar style="light" />}
    <View style={styles.row}>
      <Image source={require('../assets/logo.png')} style={styles.logo} accessibilityIgnoresInvertColors accessible={false} />
      <Text style={styles.wordmark}>QRAlalay</Text>
      <View style={{ flex: 1 }} />
      <Avatar uri={photoUrl} style={styles.photo} />
    </View>
    <Text style={styles.greeting}>Magandang araw,</Text>
    <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>{name}</Text>
    <Text style={styles.role}>{[role, barangay].filter(Boolean).join(' · ')}</Text>
    {children}
    <BrandCurve />
  </View>;
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.brand, paddingHorizontal: spacing.screen, paddingTop: 12, paddingBottom: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.onPrimary },
  wordmark: { color: colors.onPrimary, fontFamily: font.bold, fontSize: typography.body, letterSpacing: tracking.section },
  photo: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.onPrimary, backgroundColor: colors.primarySoft },
  greeting: { color: colors.onPrimary, fontFamily: font.regular, fontSize: typography.detail },
  name: { color: colors.onPrimary, fontFamily: font.bold, fontSize: typography.section + 2, letterSpacing: tracking.section, lineHeight: 32 },
  role: { color: colors.onPrimary, fontFamily: font.medium, fontSize: typography.caption + 1, marginTop: 2 },
  curve: { position: 'absolute', left: 0, right: 0, bottom: -1 },
});
