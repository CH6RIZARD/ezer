// =============================================================================
// EZER Mobile App - Apple Wallet Style Credit Card
// Realistic card with gradients, chip, contactless icon, and network logos
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FundingInstrument } from '../types';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

interface CardBrandConfig {
  gradient: [string, string];
  textColor: string;
  logoType: 'visa' | 'mastercard' | 'amex' | 'discover' | 'bank' | 'unknown';
}

const BRANDS: Record<string, CardBrandConfig> = {
  Visa: {
    gradient: ['#1434CB', '#0D2896'],
    textColor: '#FFFFFF',
    logoType: 'visa',
  },
  Mastercard: {
    gradient: ['#1A1A1A', '#2D2D2D'],
    textColor: '#FFFFFF',
    logoType: 'mastercard',
  },
  Amex: {
    gradient: ['#006FCF', '#0057A3'],
    textColor: '#FFFFFF',
    logoType: 'amex',
  },
  Discover: {
    gradient: ['#FF6000', '#E55500'],
    textColor: '#FFFFFF',
    logoType: 'discover',
  },
  Bank: {
    gradient: ['#10B981', '#059669'],
    textColor: '#FFFFFF',
    logoType: 'bank',
  },
  Unknown: {
    gradient: ['#4A5568', '#2D3748'],
    textColor: '#FFFFFF',
    logoType: 'unknown',
  },
};

// Card Network Logo Components
function VisaLogo() {
  return (
    <View style={logoStyles.visaLogo}>
      <Text style={logoStyles.visaText}>VISA</Text>
    </View>
  );
}

function MastercardLogo() {
  return (
    <View style={logoStyles.mastercardLogo}>
      <View style={[logoStyles.mcCircle, { backgroundColor: '#EB001B' }]} />
      <View style={[logoStyles.mcCircle, logoStyles.mcCircleRight, { backgroundColor: '#F79E1B' }]} />
    </View>
  );
}

function AmexLogo() {
  return (
    <View style={logoStyles.amexLogo}>
      <Text style={logoStyles.amexText}>AMERICAN{'\n'}EXPRESS</Text>
    </View>
  );
}

function DiscoverLogo() {
  return (
    <View style={logoStyles.discoverLogo}>
      <Text style={logoStyles.discoverText}>DISCOVER</Text>
      <View style={logoStyles.discoverOrb} />
    </View>
  );
}

function BankLogo() {
  return (
    <View style={logoStyles.bankLogo}>
      <Ionicons name="business" size={28} color="#FFFFFF" />
    </View>
  );
}

function UnknownLogo() {
  return (
    <View style={logoStyles.unknownLogo}>
      <Ionicons name="card" size={28} color="#FFFFFF" />
    </View>
  );
}

const LogoComponents: Record<string, React.FC> = {
  visa: VisaLogo,
  mastercard: MastercardLogo,
  amex: AmexLogo,
  discover: DiscoverLogo,
  bank: BankLogo,
  unknown: UnknownLogo,
};

interface CreditCardProps {
  card: FundingInstrument;
  isActive?: boolean;
  size?: 'small' | 'normal';
}

export function CreditCard({ card, isActive = true, size = 'normal' }: CreditCardProps) {
  const config = BRANDS[card.brand] || BRANDS.Unknown;
  const cardWidth = size === 'small' ? CARD_WIDTH * 0.7 : CARD_WIDTH;
  const cardHeight = cardWidth / 1.586;

  // Format card number display
  const cardLast4 = card.last4 && card.last4 !== '****' && card.last4 !== '0000'
    ? card.last4
    : String(Math.floor(1000 + Math.random() * 9000));

  const LogoComponent = LogoComponents[config.logoType];

  return (
    <View style={[
      styles.cardOuter,
      { width: cardWidth, height: cardHeight },
      isActive && styles.cardActive
    ]}>
      <LinearGradient
        colors={config.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Subtle Pattern */}
        <View style={styles.patternOverlay}>
          <View style={[styles.patternCircle, { top: -60, right: -40 }]} />
          <View style={[styles.patternCircle, { bottom: -80, left: -60, opacity: 0.03 }]} />
        </View>

        {/* Top Row: Chip + Contactless */}
        <View style={styles.topRow}>
          {/* EMV Chip */}
          <View style={[styles.chipContainer, size === 'small' && styles.chipContainerSmall]}>
            <LinearGradient
              colors={['#E8C547', '#D4AF37', '#B8962A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.chip}
            >
              {/* Chip pattern */}
              <View style={styles.chipPattern}>
                <View style={styles.chipLineH1} />
                <View style={styles.chipLineH2} />
                <View style={styles.chipLineV} />
                <View style={styles.chipSquare} />
              </View>
            </LinearGradient>
          </View>

          {/* Contactless Icon */}
          <View style={styles.contactlessContainer}>
            <View style={styles.contactlessIcon}>
              {[1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.contactlessWave,
                    {
                      width: 8 + i * 6,
                      height: 8 + i * 6,
                      borderRadius: (8 + i * 6) / 2,
                      opacity: 0.9 - i * 0.2,
                    },
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Network Logo */}
          <View style={styles.networkLogoContainer}>
            <LogoComponent />
          </View>
        </View>

        {/* Card Number */}
        <View style={styles.numberContainer}>
          <Text style={[
            styles.cardNumber,
            size === 'small' && styles.cardNumberSmall,
            { color: config.textColor }
          ]}>
            •••• •••• •••• {cardLast4}
          </Text>
        </View>

        {/* Bottom Info */}
        <View style={styles.bottomInfo}>
          <View style={styles.holderSection}>
            <Text style={[styles.label, { color: `${config.textColor}99` }]}>CARDHOLDER NAME</Text>
            <Text style={[
              styles.holderName,
              size === 'small' && styles.holderNameSmall,
              { color: config.textColor }
            ]}>
              {card.displayName?.toUpperCase() || 'CARDHOLDER'}
            </Text>
          </View>
          <View style={styles.expirySection}>
            <Text style={[styles.label, { color: `${config.textColor}99` }]}>VALID THRU</Text>
            <Text style={[
              styles.expiryText,
              size === 'small' && styles.expiryTextSmall,
              { color: config.textColor }
            ]}>
              12/28
            </Text>
          </View>
        </View>

        {/* Shine Effect */}
        <LinearGradient
          colors={['rgba(255,255,255,0.15)', 'transparent', 'rgba(255,255,255,0.05)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.shine}
          pointerEvents="none"
        />

        {/* Top Edge Highlight */}
        <View style={styles.edgeHighlight} />
      </LinearGradient>
    </View>
  );
}

const logoStyles = StyleSheet.create({
  visaLogo: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  visaText: {
    fontSize: 26,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  mastercardLogo: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  mcCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  mcCircleRight: {
    marginLeft: -12,
  },
  amexLogo: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  amexText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'right',
    lineHeight: 11,
    letterSpacing: 0.5,
  },
  discoverLogo: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    position: 'relative',
  },
  discoverText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  discoverOrb: {
    position: 'absolute',
    right: 0,
    bottom: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFB347',
  },
  bankLogo: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  unknownLogo: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
});

const styles = StyleSheet.create({
  cardOuter: {
    marginRight: 16,
    borderRadius: 16,
  },
  cardActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    padding: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  patternOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  patternCircle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 'auto',
  },
  chipContainer: {
    width: 48,
    height: 36,
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  chipContainerSmall: {
    width: 36,
    height: 28,
  },
  chip: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipPattern: {
    width: '80%',
    height: '70%',
    position: 'relative',
  },
  chipLineH1: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  chipLineH2: {
    position: 'absolute',
    top: '60%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  chipLineV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  chipSquare: {
    position: 'absolute',
    left: '25%',
    top: '35%',
    width: '20%',
    height: '25%',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 2,
  },
  contactlessContainer: {
    marginLeft: 16,
    marginTop: 6,
  },
  contactlessIcon: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '90deg' }],
  },
  contactlessWave: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  networkLogoContainer: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  numberContainer: {
    marginTop: 'auto',
    marginBottom: 20,
  },
  cardNumber: {
    fontSize: 21,
    fontWeight: '500',
    letterSpacing: 2.5,
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardNumberSmall: {
    fontSize: 15,
    letterSpacing: 1.5,
  },
  bottomInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  holderSection: {
    flex: 1,
  },
  expirySection: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
  },
  holderName: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  holderNameSmall: {
    fontSize: 10,
  },
  expiryText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  expiryTextSmall: {
    fontSize: 10,
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  edgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
});

export default CreditCard;
