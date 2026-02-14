// =============================================================================
// EZER Mobile App - Card Component
// White card container with rounded corners and subtle shadow
// =============================================================================

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../utils/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export function Card({ children, style, padding = 20 }: CardProps) {
  const { colors } = useTheme();

  return (
    <View style={[
      {
        backgroundColor: colors.card,
        borderRadius: 16,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 3,
        padding,
      },
      style
    ]}>
      {children}
    </View>
  );
}

export default Card;
