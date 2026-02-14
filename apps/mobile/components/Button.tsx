// =============================================================================
// EZER Mobile App - Button Component
// Primary CTA button with Dave-like styling
// =============================================================================

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'gold';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  fullWidth = true,
}: ButtonProps) {
  const { colors, isDark } = useTheme();

  const getButtonStyle = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: colors.primary };
      case 'secondary':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.text,
        };
      case 'danger':
        return { backgroundColor: colors.danger };
      case 'success':
        return { backgroundColor: colors.success };
      case 'gold':
        return { backgroundColor: colors.accent };
      default:
        return { backgroundColor: colors.primary };
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'primary':
      case 'danger':
      case 'success':
        return { color: '#FFFFFF' };
      case 'secondary':
        return { color: colors.text };
      case 'gold':
        return { color: isDark ? '#1A1A1A' : '#1F2933' };
      default:
        return { color: '#FFFFFF' };
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getButtonStyle(),
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' ? colors.text : (variant === 'gold' ? (isDark ? '#1A1A1A' : '#1F2933') : '#FFFFFF')}
          size="small"
        />
      ) : (
        <Text style={[styles.text, getTextStyle(), textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Button;
