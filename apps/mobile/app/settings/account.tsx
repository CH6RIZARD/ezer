// =============================================================================
// EZER Mobile App - Account Details Screen
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';

export default function AccountDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [name, setName] = useState('John Doe');
  const [email, setEmail] = useState('john.doe@example.com');
  const [phone, setPhone] = useState('+1 (555) 123-4567');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing Fields', 'Name and email are required.');
      return;
    }
    setSaved(true);
    Alert.alert('Saved', 'Your account details have been updated.');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChangePassword = () => {
    Alert.prompt
      ? Alert.prompt('Change Password', 'Enter your new password:', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Update', onPress: (pwd) => {
            if (pwd && pwd.length >= 8) {
              Alert.alert('Password Updated', 'Your password has been changed successfully.');
            } else {
              Alert.alert('Error', 'Password must be at least 8 characters.');
            }
          }},
        ], 'secure-text')
      : Alert.alert(
          'Change Password',
          'To change your password, we\'ll send a reset link to your email address.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Send Reset Link', onPress: () => {
              Alert.alert('Email Sent', `A password reset link has been sent to ${email}.`);
            }},
          ]
        );
  };

  const handleToggle2FA = () => {
    Alert.alert(
      'Two-Factor Authentication',
      'Enable two-factor authentication for extra security. We\'ll send a verification code to your phone number each time you log in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enable 2FA', onPress: () => {
          Alert.alert('2FA Enabled', `Verification codes will be sent to ${phone} on each login.`);
        }},
      ]
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Account Details</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        {/* Profile Section */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textSecondary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Personal Information</Text>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 }}>Full Name</Text>
            <TextInput style={{ backgroundColor: colors.card, borderRadius: 12, padding: 16, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border }} value={name} onChangeText={setName} placeholderTextColor={colors.textSecondary} />
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 }}>Email</Text>
            <TextInput style={{ backgroundColor: colors.card, borderRadius: 12, padding: 16, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border }} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.textSecondary} />
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 }}>Phone Number</Text>
            <TextInput style={{ backgroundColor: colors.card, borderRadius: 12, padding: 16, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border }} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.textSecondary} />
          </View>
        </View>

        {/* Security Section */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textSecondary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Security</Text>

          <Pressable onPress={handleChangePassword} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <Ionicons name="key-outline" size={24} color={colors.text} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Change Password</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>

          <Pressable onPress={handleToggle2FA} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <Ionicons name="shield-checkmark-outline" size={24} color={colors.text} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 12 }}>Two-Factor Authentication</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Save Button */}
        <Pressable onPress={handleSave} style={{ backgroundColor: colors.accent, paddingVertical: 16, borderRadius: 12, alignItems: 'center', shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, marginBottom: insets.bottom + 40 }}>
          <Text style={{ color: '#1F2933', fontSize: 16, fontWeight: '700' }}>{saved ? 'Saved!' : 'Save Changes'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
