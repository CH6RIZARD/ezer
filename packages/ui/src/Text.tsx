import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { theme } from './theme';

interface TextProps extends RNTextProps {
  variant?: 'heading' | 'subheading' | 'body' | 'caption' | 'huge';
  color?: string;
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
}

export function Text({ variant = 'body', color, weight, style, ...props }: TextProps) {
  const styles = StyleSheet.create({
    base: {
      color: color || theme.colors.text,
      fontWeight: weight ? theme.fontWeight[weight] : theme.fontWeight.normal,
    },
    huge: {
      fontSize: theme.fontSize.huge,
      fontWeight: theme.fontWeight.bold,
    },
    heading: {
      fontSize: theme.fontSize.xxl,
      fontWeight: theme.fontWeight.semibold,
    },
    subheading: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.medium,
    },
    body: {
      fontSize: theme.fontSize.md,
    },
    caption: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
  });

  return <RNText style={[styles.base, styles[variant], style]} {...props} />;
}
