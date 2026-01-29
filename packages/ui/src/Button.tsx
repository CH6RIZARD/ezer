import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

interface ButtonProps extends TouchableOpacityProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const styles = StyleSheet.create({
    base: {
      borderRadius: theme.borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    sm: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
    },
    md: {
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
    },
    lg: {
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.xl,
    },
    primary: {
      backgroundColor: theme.colors.charcoal,
    },
    secondary: {
      backgroundColor: theme.colors.gray200,
    },
    danger: {
      backgroundColor: theme.colors.danger,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    disabled: {
      opacity: 0.5,
    },
  });

  const textStyles = StyleSheet.create({
    primary: {
      color: theme.colors.offWhite,
    },
    secondary: {
      color: theme.colors.charcoal,
    },
    danger: {
      color: theme.colors.offWhite,
    },
    ghost: {
      color: theme.colors.charcoal,
    },
  });

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[size],
        styles[variant],
        (disabled || loading) && styles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={textStyles[variant].color} />
      ) : (
        <Text weight="semibold" style={textStyles[variant]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}
