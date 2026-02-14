import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '@/theme/spacing';
import { formatCurrency, formatPercentage, calculateProgress } from '@/utils/format';

interface SavingsGoal {
  id: string;
  name: string;
  icon: string;
  currentAmount: number;
  targetAmount: number;
}

interface SavingsBucketCardProps {
  goal: SavingsGoal;
  onPress: () => void;
  onPressAddFunds: () => void;
}

export function SavingsBucketCard({
  goal,
  onPress,
  onPressAddFunds,
}: SavingsBucketCardProps) {
  const progress = calculateProgress(goal.currentAmount, goal.targetAmount);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: progress,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();
  }, [progress]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const isComplete = progress >= 100;

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.card}
        accessibilityLabel={`${goal.name} bucket, ${formatPercentage(progress)} complete`}
        accessibilityRole="button"
      >
        {/* Icon & Progress Ring */}
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, isComplete && styles.iconCircleComplete]}>
            <Text style={styles.icon}>{goal.icon}</Text>
          </View>
          {isComplete && (
            <View style={styles.checkBadge}>
              <Text style={styles.checkIcon}>✓</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.name} numberOfLines={1}>{goal.name}</Text>
            <Text style={[styles.percentage, isComplete && styles.percentageComplete]}>
              {formatPercentage(progress)}
            </Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressBar,
                  { width: progressWidth },
                  isComplete && styles.progressBarComplete,
                ]}
              />
            </View>
          </View>

          {/* Amount Row */}
          <View style={styles.amountRow}>
            <Text style={styles.currentAmount}>
              {formatCurrency(goal.currentAmount, false)}
            </Text>
            <Text style={styles.targetAmount}>
              of {formatCurrency(goal.targetAmount, false)}
            </Text>
          </View>
        </View>

        {/* Add Funds Button */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onPressAddFunds();
          }}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.addButtonPressed,
          ]}
          accessibilityLabel={`Add funds to ${goal.name}`}
          accessibilityRole="button"
        >
          <Text style={styles.addButtonIcon}>+</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadow.md,
  },
  iconContainer: {
    position: 'relative',
    marginRight: spacing.lg,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  iconCircleComplete: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  icon: {
    fontSize: 24,
  },
  checkBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cardBackground,
  },
  checkIcon: {
    fontSize: 10,
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  name: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    flex: 1,
    marginRight: spacing.sm,
  },
  percentage: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: fontWeight.bold,
  },
  percentageComplete: {
    color: colors.success,
  },
  progressContainer: {
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressBarComplete: {
    backgroundColor: colors.success,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currentAmount: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    marginRight: spacing.xs,
  },
  targetAmount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  addButtonPressed: {
    backgroundColor: colors.primaryLight,
    transform: [{ scale: 0.95 }],
  },
  addButtonIcon: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    marginTop: -2,
  },
});
