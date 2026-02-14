// =============================================================================
// EZER Mobile App - Onboarding Screen
// Welcome flow for new users
// =============================================================================

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Dimensions,
  Pressable,
  FlatList,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../utils/AuthContext';
import { useTheme } from '../utils/ThemeContext';

const { width } = Dimensions.get('window');

const onboardingData = [
  {
    id: '1',
    icon: 'card-outline',
    title: 'Connect Your Cards',
    description: 'Securely link your bank accounts and credit cards to automatically track all your subscriptions in one place.',
    colorKey: 'primary',
  },
  {
    id: '2',
    icon: 'notifications-outline',
    title: 'Get Smart Alerts',
    description: 'Receive timely notifications before trials end and subscriptions renew. Never get charged unexpectedly again.',
    colorKey: 'accent',
  },
  {
    id: '3',
    icon: 'trending-down-outline',
    title: 'Stop the Drain',
    description: 'Identify forgotten subscriptions, cancel with one tap, and see exactly how much you\'re saving each month.',
    colorKey: 'success',
  },
  {
    id: '4',
    icon: 'wallet-outline',
    title: 'Save Automatically',
    description: 'Set savings goals and automatically save money from cancelled subscriptions. Watch your savings grow!',
    colorKey: 'danger',
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { completeOnboarding } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const getColor = (colorKey: string) => {
    switch (colorKey) {
      case 'primary': return colors.primary;
      case 'accent': return colors.accent;
      case 'success': return colors.success;
      case 'danger': return colors.danger;
      default: return colors.primary;
    }
  };

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = async () => {
    await completeOnboarding();
    router.replace('/(tabs)/home');
  };

  const renderItem = ({ item }: { item: typeof onboardingData[0] }) => {
    const itemColor = getColor(item.colorKey);
    return (
      <View style={{ flex: 1, width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
        <View style={{ marginBottom: 40 }}>
          <LinearGradient
            colors={[itemColor, itemColor + '80']}
            style={{
              width: 160, height: 160, borderRadius: 40,
              justifyContent: 'center', alignItems: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
            }}
          >
            <Ionicons name={item.icon as any} size={80} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 16 }}>{item.title}</Text>
        <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 }}>{item.description}</Text>
      </View>
    );
  };

  const renderDots = () => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 40 }}>
      {onboardingData.map((_, index) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });
        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={index}
            style={{
              height: 8, borderRadius: 4, backgroundColor: colors.primary, marginHorizontal: 4,
              width: dotWidth, opacity,
            }}
          />
        );
      })}
    </View>
  );

  const isLastSlide = currentIndex === onboardingData.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Skip Button */}
      <Pressable style={{ position: 'absolute', top: 60, right: 24, zIndex: 10, paddingVertical: 8, paddingHorizontal: 16 }} onPress={handleSkip}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textSecondary }}>Skip</Text>
      </Pressable>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(newIndex);
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      />

      {/* Dots */}
      {renderDots()}

      {/* Bottom Buttons */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 20 }}>
        <Pressable style={{
          borderRadius: 16, overflow: 'hidden',
          shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
        }} onPress={handleNext}>
          <LinearGradient
            colors={[colors.primary, '#7C3AED']}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 8 }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }}>
              {isLastSlide ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons
              name={isLastSlide ? 'checkmark' : 'arrow-forward'}
              size={20}
              color="#FFFFFF"
            />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}
