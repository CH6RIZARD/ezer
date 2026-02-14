// =============================================================================
// EZER Mobile App - Notifications Settings
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [trialAlerts, setTrialAlerts] = useState(true);
  const [renewalAlerts, setRenewalAlerts] = useState(true);
  const [priceChanges, setPriceChanges] = useState(true);

  const itemStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12 };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {/* Notification Channels */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textSecondary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notification Channels</Text>

          <View style={itemStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name="notifications" size={24} color={colors.text} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>Push Notifications</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Get alerts on your device</Text>
              </View>
            </View>
            <Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" />
          </View>

          <View style={itemStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name="mail" size={24} color={colors.text} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>Email Notifications</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Receive updates via email</Text>
              </View>
            </View>
            <Switch value={emailEnabled} onValueChange={setEmailEnabled} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" />
          </View>

          <View style={itemStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name="chatbubble" size={24} color={colors.text} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>SMS Notifications</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Get text messages</Text>
              </View>
            </View>
            <Switch value={smsEnabled} onValueChange={setSmsEnabled} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" />
          </View>
        </View>

        {/* Alert Types */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textSecondary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alert Types</Text>

          <View style={itemStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name="timer" size={24} color={colors.text} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>Trial Expiration</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>24hrs before trial ends</Text>
              </View>
            </View>
            <Switch value={trialAlerts} onValueChange={setTrialAlerts} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" />
          </View>

          <View style={itemStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name="repeat" size={24} color={colors.text} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>Upcoming Renewals</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>3 days before renewal</Text>
              </View>
            </View>
            <Switch value={renewalAlerts} onValueChange={setRenewalAlerts} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" />
          </View>

          <View style={itemStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name="trending-up" size={24} color={colors.text} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>Price Changes</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>When subscription prices increase</Text>
              </View>
            </View>
            <Switch value={priceChanges} onValueChange={setPriceChanges} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
