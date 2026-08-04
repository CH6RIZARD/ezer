// =============================================================================
// EZER Mobile App - Login Screen
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
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../utils/AuthContext';
import { useTheme } from '../../utils/ThemeContext';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password');
      return;
    }

    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);

    if (result.ok) {
      if (result.ok && result.hasCompletedOnboarding) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/onboarding');
      }
    } else {
      // The server's actual reason — "invalid email or password" was shown
      // even when the API was unreachable.
      Alert.alert('Login failed', result.ok ? '' : result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'space-between', paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }}>
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <LinearGradient
            colors={[colors.primary, '#7C3AED']}
            style={{ width: 80, height: 80, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}
          >
            <Text style={{ fontSize: 40, fontWeight: '700', color: '#FFFFFF' }}>E</Text>
          </LinearGradient>
          <Text style={{ fontSize: 32, fontWeight: '700', color: colors.text, letterSpacing: 4 }}>EZER</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8 }}>Your Subscription Guardian</Text>
        </View>

        {/* Login Form */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Welcome Back</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 32 }}>Sign in to continue managing your subscriptions</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16, paddingHorizontal: 16 }}>
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

          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16, paddingHorizontal: 16 }}>
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
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          <Pressable style={{ alignSelf: 'flex-end', marginBottom: 24 }}>
            <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>Forgot Password?</Text>
          </Pressable>

          <Pressable
            style={{
              backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center',
              shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
              opacity: isLoading ? 0.7 : 1,
            }}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Sign In</Text>
            )}
          </Pressable>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 24 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ marginHorizontal: 16, fontSize: 14, color: colors.textSecondary }}>or continue with</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Social Login */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
            <Pressable style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="logo-apple" size={24} color={colors.text} />
            </Pressable>
            <Pressable style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="logo-google" size={24} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Sign Up Link */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 20 }}>
          <Text style={{ fontSize: 14, color: colors.textSecondary }}>Don't have an account? </Text>
          <Pressable onPress={() => router.push('/auth/signup')}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>Sign Up</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
