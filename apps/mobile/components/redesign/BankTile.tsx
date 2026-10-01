// =============================================================================
// EZER Redesign — Bank initial/logo tile
//
// Shared by settings/linked-banks.tsx, screens/BankDetail.tsx and
// PayIn4AccountPicker.tsx — three places that were each drawing a flat
// tinted-initial circle and nothing else, when a real logo (networkArt, the
// exact same field Wallet's own card art already renders via BankCardFace)
// was sitting right there on the data the whole time. Falls back to the
// tinted initial — tintFor()'s real per-bank brand color, not a single flat
// purple — when there's no logo, or the logo URL fails to load.
// =============================================================================

import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily } from '../../theme/type';
import { initialFor, tintFor } from '../../utils/linkedBanks';

export default function BankTile({
  institutionName,
  networkArt,
  size = 38,
}: {
  institutionName: string | null;
  networkArt?: string | null;
  size?: number;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.32);

  if (networkArt && !failed) {
    return (
      <View
        style={[
          styles.wrap,
          { width: size, height: size, borderRadius: radius, backgroundColor: '#FFFFFF', borderColor: colors.line },
        ]}
      >
        <Image
          source={{ uri: networkArt }}
          style={{ width: size * 0.72, height: size * 0.72 }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius, backgroundColor: tintFor(institutionName) ?? colors.accInk },
      ]}
    >
      <Text style={{ fontFamily: fontFamily.bold, fontSize: Math.round(size * 0.34), color: '#FFFFFF' }}>
        {initialFor(institutionName)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
