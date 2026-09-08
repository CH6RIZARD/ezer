// =============================================================================
// EZER Mobile — Account
//
// This screen used to show a stranger: `useState('John Doe')`,
// 'john.doe@example.com', '+1 (555) 123-4567'. Save called no API, "Change
// Password" only opened an alert, and "Two-Factor Authentication" announced
// that it was enabled without enabling anything. A signed-in user opened their
// own account page and saw someone else's details next to two security
// controls that did nothing.
//
// It now shows the signed-in user, and it carries the two rights the published
// privacy policy promises are exercisable "from inside the app, without asking
// us":
//
//   · Download your data   → GET  /account/export
//   · Delete your account  → DELETE /account
//
// Those endpoints existed server-side but nothing called them, which made the
// policy — already submitted to Plaid — a false statement. Apple also requires
// in-app account deletion for any app offering account creation (App Store
// Review Guideline 5.1.1(v)); its absence is a rejection, not a nit.
//
// Password change and 2FA are GONE rather than reimplemented: neither has a
// backend, and a control that reports success while doing nothing is worse
// than no control at all.
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, Share } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { useAuth } from '../../utils/AuthContext';
import { api } from '../../utils/api';

export default function AccountDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, logout } = useAuth();

  const [busy, setBusy] = useState<null | 'export' | 'delete'>(null);

  /**
   * Data portability. The server strips passwordHash before returning, so this
   * is the subject's data and nothing else.
   */
  const handleExport = async () => {
    setBusy('export');
    try {
      const res: any = await api.get('/account/export');
      const json = JSON.stringify(res?.data ?? res, null, 2);
      await Share.share({
        title: 'EZER account data',
        message: json,
      });
    } catch (err: any) {
      Alert.alert('Could not export', err?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  /**
   * Deletion is irreversible and it revokes bank connections upstream at Plaid
   * before removing anything locally, so it asks twice and names what goes.
   */
  const handleDelete = () => {
    Alert.alert(
      'Delete your account?',
      'This removes your account, your linked banks, your subscriptions and your savings goals. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Your bank connections are revoked and your data is erased. There is no way back.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    setBusy('delete');
                    try {
                      await api.del('/account');
                      // Clear the local session before navigating, or the app
                      // would sit on a token for a user that no longer exists.
                      await logout();
                      router.replace('/onboarding');
                    } catch (err: any) {
                      setBusy(null);
                      Alert.alert('Could not delete', err?.message ?? 'Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 24,
          paddingTop: insets.top + 16,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card,
            justifyContent: 'center', alignItems: 'center',
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Account</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        {/* --- who you actually are ---------------------------------------- */}
        <Text
          style={{
            fontSize: 13, fontWeight: '700', color: colors.textSecondary,
            marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
          }}
        >
          Signed in as
        </Text>

        <View
          style={{
            backgroundColor: colors.card, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: colors.border, marginBottom: 32,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
            {user?.name || '—'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>
            {user?.email || '—'}
          </Text>
        </View>

        {/* --- rights ------------------------------------------------------- */}
        <Text
          style={{
            fontSize: 13, fontWeight: '700', color: colors.textSecondary,
            marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
          }}
        >
          Your data
        </Text>

        <Pressable onPress={handleExport} disabled={busy !== null} style={rowStyle}>
          {busy === 'export' ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Ionicons name="download-outline" size={22} color={colors.text} />
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
              Download your data
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
              Everything we hold about you, as a file.
            </Text>
          </View>
        </Pressable>

        <Pressable onPress={handleDelete} disabled={busy !== null} style={rowStyle}>
          {busy === 'delete' ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.danger }}>
              Delete your account
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
              Erases your data and disconnects your banks. Permanent.
            </Text>
          </View>
        </Pressable>

        <Text
          style={{
            fontSize: 12, lineHeight: 18, color: colors.textSecondary,
            marginTop: 12, marginBottom: insets.bottom + 40,
          }}
        >
          Deleting revokes every bank connection with Plaid before your records are
          removed, so nothing stays linked to your bank afterwards.
        </Text>
      </View>
    </ScrollView>
  );
}
