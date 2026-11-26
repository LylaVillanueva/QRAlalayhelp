import React from 'react';
import TabBar from './TabBar';

const tabs = [
  { key: 'home', labelKey: 'home', screen: 'Home', icon: 'home' },
  { key: 'alerts', labelKey: 'assignments', screen: 'AlertScreen', icon: 'clipboard-check' },
  { key: 'incidents', labelKey: 'history', screen: 'IncidentScreen', icon: 'history' },
  { key: 'settings', labelKey: 'settings', screen: 'SettingsScreen', icon: 'cog' },
];

const activeMap = {
  AlertDetails: 'alerts',
  ConfirmationScreen: 'alerts',
  IncidentReportScreen: 'alerts',
  ProfileScreen: 'alerts',
};

export default function ResponderTabBar() {
  return <TabBar tabs={tabs} activeMap={activeMap} />;
}
