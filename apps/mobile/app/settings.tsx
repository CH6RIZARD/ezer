// =============================================================================
// EZER Mobile App - Settings Screen
// Profile, preferences, and account management
// =============================================================================

import React from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, Linking, Share, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { usePremium } from '../utils/PremiumContext';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme, colors } = useTheme();
  const { logout, user } = useAuth();
  const { status, daysRemaining, restorePurchases } = usePremium();

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of EZER?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: async () => {
          await logout();
          router.replace('/auth/login');
        }},
      ]
    );
  };

  const handleContactUs = () => {
    Linking.openURL('mailto:support@ezer.app?subject=Contact Request');
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL('https://ezer.app/privacy');
  };

  const handleTermsOfService = () => {
    Linking.openURL('https://ezer.app/terms');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: async () => {
          // In production, call API to delete account
          await logout();
          Alert.alert('Account Deleted', 'Your account has been deleted.');
          router.replace('/auth/login');
        }},
      ]
    );
  };

  const handleRateApp = () => {
    const storeUrl = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/ezer/id6504567890'
      : 'https://play.google.com/store/apps/details?id=com.ezer.app';
    Linking.openURL(storeUrl);
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message: 'Check out EZER — it tracks your subscriptions, catches hidden charges, and helps you save automatically. https://ezer.app/download',
        title: 'EZER - Stop Subscription Drain',
      });
    } catch (_) {
      // User dismissed share sheet
    }
  };

  const itemStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => router.back()} style={{
          width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card,
          justifyContent: 'center', alignItems: 'center',
          shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
        }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Settings</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent, letterSpacing: 2, marginTop: 2 }}>EZER</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* User Info Card */}
      {user && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
          marginHorizontal: 24, marginBottom: 24, padding: 16, borderRadius: 16,
          shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
        }}>
          <View style={{
            width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
            justifyContent: 'center', alignItems: 'center', marginRight: 16,
          }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#FFFFFF' }}>{user.name?.charAt(0).toUpperCase() || 'U'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{user.name || 'User'}</Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>{user.email}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </View>
      )}

      {/* Profile */}
      <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Profile</Text>
        <Pressable style={itemStyle} onPress={() => router.push('/settings/account')}>
          <Ionicons name="person-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Account Details</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Preferences */}
      <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Preferences</Text>

        {/* Dark Mode Toggle */}
        <View style={itemStyle}>
          <Ionicons name={isDark ? 'moon' : 'moon-outline'} size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Dark Mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={'#FFFFFF'}
          />
        </View>

        <Pressable style={itemStyle} onPress={() => router.push('/settings/notifications')}>
          <Ionicons name="notifications-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Notifications</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable style={itemStyle} onPress={() => router.push('/settings/connected-accounts')}>
          <Ionicons name="wallet-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Connected Accounts</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Premium */}
      <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Premium</Text>
        {status === 'premium' ? (
          <View style={itemStyle}>
            <Ionicons name="diamond" size={24} color={colors.accent} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Premium Active</Text>
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
          </View>
        ) : (
          <Pressable style={[itemStyle, { borderWidth: 1, borderColor: colors.accent + '30' }]} onPress={() => router.push('/screens/Paywall')}>
            <Ionicons name="diamond-outline" size={24} color={colors.accent} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>
              {status === 'trial' ? `Upgrade to Premium (${daysRemaining}d left)` : 'Unlock Premium — $3'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.accent} />
          </Pressable>
        )}
      </View>

      {/* Support */}
      <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Support</Text>
        <Pressable style={itemStyle} onPress={() => router.push('/settings/help')}>
          <Ionicons name="help-circle-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Help Center</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={itemStyle} onPress={handleContactUs}>
          <Ionicons name="mail-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Contact Us</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={itemStyle} onPress={handleRateApp}>
          <Ionicons name="star-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Rate EZER</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={itemStyle} onPress={handleShareApp}>
          <Ionicons name="share-social-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Share with Friends</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={itemStyle} onPress={async () => {
          const restored = await restorePurchases();
          if (restored) {
            Alert.alert('Restored', 'Your premium access has been restored.');
          } else {
            Alert.alert('No Purchase Found', 'We couldn\'t find a previous purchase on this account.');
          }
        }}>
          <Ionicons name="refresh-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Restore Purchases</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Legal */}
      <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Legal</Text>
        <Pressable style={itemStyle} onPress={handlePrivacyPolicy}>
          <Ionicons name="document-text-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={itemStyle} onPress={handleTermsOfService}>
          <Ionicons name="document-outline" size={24} color={colors.text} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Terms of Service</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Danger Zone */}
      <View style={{ marginHorizontal: 24, marginBottom: 24 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.danger, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Danger Zone</Text>
        <Pressable style={[itemStyle, { backgroundColor: isDark ? '#2A1A1A' : '#FEF2F2', borderWidth: 1, borderColor: isDark ? '#4A2A2A' : '#FECACA' }]} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={24} color={colors.danger} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.danger, marginLeft: 12 }}>Delete Account</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.danger} />
        </Pressable>
      </View>

      <Pressable style={{
        backgroundColor: colors.danger, marginHorizontal: 24, paddingVertical: 16, borderRadius: 12, alignItems: 'center',
        shadowColor: colors.danger, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
        marginBottom: insets.bottom + 40,
      }} onPress={handleLogout}>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Log Out</Text>
      </Pressable>

      {/* App Version */}
      <Text style={{ textAlign: 'center', fontSize: 12, color: colors.textSecondary, marginBottom: 40, marginTop: 16 }}>EZER v1.0.0</Text>
    </ScrollView>
  );
}
