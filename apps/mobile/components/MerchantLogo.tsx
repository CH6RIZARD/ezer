import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface MerchantLogoProps {
  merchantName: string;
  merchantColor?: string;
  size?: number;
}

export function MerchantLogo({ merchantName, merchantColor, size = 48 }: MerchantLogoProps) {
  const color = merchantColor || '#9CA3AF';
  const initial = (merchantName || '?').charAt(0).toUpperCase();
  
  return (
    <View
      style={[
        styles.logo,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  initial: {
    color: '#FFF',
    fontWeight: '700',
  },
});
