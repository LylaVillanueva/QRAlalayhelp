// One tab bar shared by all three roles, parameterized by that role's own
// tabs/active-route mapping (previously three separate files — TabButtons.js,
// GuardianTabButtons.js, ResponderTabButtons.js — that had drifted in icon
// size, scan-button shadow (two of the three used a white shadow on a white
// button, which is effectively invisible), and whether the scan button had
// a text label under it).
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '../AppText';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors, font } from '../../constants/theme';
import { useAccessibilitySettings } from "../../contexts/AccessibilitySettingsContext";

export default function TabBar({ tabs, activeMap = {} }) {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useAccessibilitySettings();
  const activeTab = activeMap[route.name] ?? tabs.find((tab) => tab.screen === route.name)?.key;
  const mid = Math.ceil(tabs.length / 2);

  return (
    <View style={styles.tabBar}>
      {tabs.slice(0, mid).map((tab) => (
        <TabItem key={tab.key} tab={tab} active={activeTab === tab.key} onPress={() => navigation.navigate(tab.screen)} t={t} />
      ))}

      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => navigation.navigate('ScannerScreen')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Scan a QRAlalay card"
      >
        <FontAwesome5 name="qrcode" size={26} color={colors.onPrimary} />
      </TouchableOpacity>

      {tabs.slice(mid).map((tab) => (
        <TabItem key={tab.key} tab={tab} active={activeTab === tab.key} onPress={() => navigation.navigate(tab.screen)} t={t} />
      ))}
    </View>
  );
}

function TabItem({ tab, active, onPress, t }) {
  const label = tab.labelKey ? t(tab.labelKey) : tab.label;
  return (
    <TouchableOpacity
      style={styles.tabButton}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.iconWrap, active && styles.iconActive]}>
        <FontAwesome5 name={tab.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
      </View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]} >{label}</Text>
    </TouchableOpacity>
  );
}

// Digital Bayanihan navigation: warm-white surface with a hairline top
// border, blue active icon and label on a soft blue indicator, neutral
// inactive tabs. The screen's SafeAreaView pads below it for gesture bars.
const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 8,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, minWidth: 0, paddingVertical: 2 },
  iconWrap: { borderRadius: 14, width: 52, height: 28, justifyContent: 'center', alignItems: 'center' },
  iconActive: { backgroundColor: colors.primarySoft },
  tabLabel: { fontSize: 12, fontFamily: font.medium, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  tabLabelActive: { color: colors.primary, fontFamily: font.semibold },
  scanButton: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 4, borderColor: colors.background,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: -24, marginHorizontal: 4,
  },
});
