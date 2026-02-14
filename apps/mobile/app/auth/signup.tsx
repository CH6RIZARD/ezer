// =============================================================================
// EZER Mobile App - Signup Screen
// =============================================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../utils/AuthContext';
import { useTheme } from '../../utils/ThemeContext';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleSignup = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (!acceptedTerms) {
      Alert.alert('Error', 'Please accept the Terms of Service and Privacy Policy');
      return;
    }

    setIsLoading(true);
    const success = await signup(email, password, name);
    setIsLoading(false);

    if (success) {
      router.replace('/onboarding');
    } else {
      Alert.alert('Signup Failed', 'An error occurred. Please try again.');
    }
  };

  const inputStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    paddingHorizontal: 16,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <Pressable onPress={() => router.back()} style={{
          width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card,
          justifyContent: 'center', alignItems: 'center', marginBottom: 20,
          shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
        }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>

        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <LinearGradient
            colors={[colors.primary, '#7C3AED']}
            style={{ width: 64, height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 32, fontWeight: '700', color: '#FFFFFF' }}>E</Text>
          </LinearGradient>
        </View>

        {/* Signup Form */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Create Account</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>Start saving money on forgotten subscriptions</Text>

          <View style={inputStyle}>
            <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
            <TextInput
              style={{ flex: 1, paddingVertical: 16, fontSize: 16, color: colors.text }}
              placeholder="Full Name"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={inputStyle}>
            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
            <TextInput
              style={{ flex: 1, paddingVertical: 16, fontSize: 16, color: colors.text }}
              placeholder="Email address"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={inputStyle}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
            <TextInput
              style={{ flex: 1, paddingVertical: 16, fontSize: 16, color: colors.text }}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={inputStyle}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
            <TextInput
              style={{ flex: 1, paddingVertical: 16, fontSize: 16, color: colors.text }}
              placeholder="Confirm Password"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
          </View>

          {/* Password Requirements */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons
                name={password.length >= 6 ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={password.length >= 6 ? colors.success : colors.textSecondary}
              />
              <Text style={{ fontSize: 13, color: password.length >= 6 ? colors.success : colors.textSecondary, marginLeft: 8 }}>
                At least 6 characters
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons
                name={password === confirmPassword && password.length > 0 ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={password === confirmPassword && password.length > 0 ? colors.success : colors.textSecondary}
              />
              <Text style={{ fontSize: 13, color: password === confirmPassword && password.length > 0 ? colors.success : colors.textSecondary, marginLeft: 8 }}>
                Passwords match
              </Text>
            </View>
          </View>

          {/* Terms Checkbox */}
          <Pressable style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 }} onPress={() => setAcceptedTerms(!acceptedTerms)}>
            <View style={{
              width: 22, height: 22, borderRadius: 6, borderWidth: 2,
              borderColor: acceptedTerms ? colors.primary : colors.border,
              backgroundColor: acceptedTerms ? colors.primary : 'transparent',
              marginRight: 12, justifyContent: 'center', alignItems: 'center',
            }}>
              {acceptedTerms && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
            <Text style={{ flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
              I agree to the{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Privacy Policy</Text>
            </Text>
          </Pressable>

          <Pressable
            style={{
              backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center',
              shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
              opacity: isLoading ? 0.7 : 1,
            }}
            onPress={handleSignup}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Create Account</Text>
            )}
          </Pressable>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 24 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ marginHorizontal: 16, fontSize: 14, color: colors.textSecondary }}>or sign up with</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Social Signup */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
            <Pressable style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="logo-apple" size={24} color={colors.text} />
            </Pressable>
            <Pressable style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="logo-google" size={24} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Login Link */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 20 }}>
          <Text style={{ fontSize: 14, color: colors.textSecondary }}>Already have an account? </Text>
          <Pressable onPress={() => router.push('/auth/login')}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
