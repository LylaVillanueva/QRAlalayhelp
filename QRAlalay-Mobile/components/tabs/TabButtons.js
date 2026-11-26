import React from 'react';
import TabBar from './TabBar';

const tabs = [
  { key: 'home', labelKey: 'home', screen: 'Home', icon: 'home' },
  { key: 'residents', labelKey: 'residents', screen: 'ResidentScreen', icon: 'address-card' },
  { key: 'alert', labelKey: 'assistance', screen: 'AlertScreen', icon: 'hands-helping' },
  { key: 'profile', labelKey: 'settings', screen: 'SettingsScreen', icon: 'cog' },
];

const activeMap = {
  ProfileScreen: 'residents',
  AuditLogScreen: 'alert',
  AlertDetails: 'alert',
  AssignResponder: 'alert',
  EnrollNewResident: 'residents',
  ManageUsers: 'profile',
  UserDetails: 'profile',
  AddUser: 'profile',
};

export default function AdminTabBar() {
  return <TabBar tabs={tabs} activeMap={activeMap} />;
}
