import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { theme } from './theme';

interface CardProps extends ViewProps {
  padding?: keyof typeof theme.spacing;
  shadow?: keyof typeof theme.shadows;
}

export function Card({ padding = 'md', shadow = 'sm', style, ...props }: CardProps) {
  const styles = StyleSheet.create({
    card: {
      backgroundColor: theme.colors.cardBackground,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing[padding],
      ...theme.shadows[shadow],
    },
  });

  return <View style={[styles.card, style]} {...props} />;
}
