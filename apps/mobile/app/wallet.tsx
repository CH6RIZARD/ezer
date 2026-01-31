import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, FlatList } from 'react-native';
import { router } from 'expo-router';
import { Text, Button, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../src/api/client';

export default function WalletScreen() {
  const [instruments, setInstruments] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const [range, setRange] = useState('last30');

  useEffect(() => {
    loadInstruments();
  }, []);

  useEffect(() => {
    if (instruments.length > 0) {
      loadSummary(instruments[selectedIndex].id);
    }
  }, [selectedIndex, range, instruments]);

  const loadInstruments = async () => {
    try {
      const result = await api.getInstruments();
      if (result.success) {
        setInstruments(result.data);
      }
    } catch (error) {
      console.error('Failed to load instruments:', error);
    }
  };

  const loadSummary = async (instrumentId: string) => {
    try {
      const result = await api.getInstrumentSummary(instrumentId, range);
      if (result.success) {
        setSummary(result.data);
      }
    } catch (error) {
      console.error('Failed to load summary:', error);
    }
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const renderCard = ({ item, index }: any) => (
    <Card
      style={[
        styles.fundingCard,
        { backgroundColor: item.issuerColorHint || theme.colors.charcoal },
      ]}
    >
      <Text variant="subheading" color="#FFFFFF">
        {item.displayName}
      </Text>
      <Text variant="body" color="#FFFFFF" style={styles.cardNumber}>
        •••• {item.last4}
      </Text>
      <Text variant="caption" color="#FFFFFF">
        {item.brand}
      </Text>
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScrollView>
        <Text variant="heading" style={styles.title}>
          Wallet
        </Text>

        <FlatList
          horizontal
          data={instruments}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / 300);
            setSelectedIndex(index);
          }}
          style={styles.carousel}
        />

        <View style={styles.rangeSelector}>
          {['last30', 'thisMonth', 'last90'].map((r) => (
            <Button
              key={r}
              variant={range === r ? 'primary' : 'ghost'}
              size="sm"
              onPress={() => setRange(r)}
            >
              {r === 'last30' ? 'Last 30' : r === 'thisMonth' ? 'This Month' : 'Last 90'}
            </Button>
          ))}
        </View>

        {summary && (
          <>
            <Card style={styles.summaryCard}>
              <Text variant="caption" color={theme.colors.textSecondary}>
                Total Drained
              </Text>
              <Text variant="huge" color={theme.colors.redDrain}>
                {formatCurrency(summary.drainedAmountCents)}
              </Text>
              <Text variant="body" style={styles.subCount}>
                {summary.activeSubscriptionsCount} active subscriptions
              </Text>
            </Card>

            <Button
              variant="primary"
              size="lg"
              onPress={() =>
                router.push(`/card-detail?id=${instruments[selectedIndex]?.id}`)
              }
              style={styles.primaryAction}
            >
              Review Card Drain
            </Button>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  title: {
    padding: theme.spacing.lg,
  },
  carousel: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  fundingCard: {
    width: 280,
    height: 160,
    marginRight: theme.spacing.md,
    padding: theme.spacing.lg,
    justifyContent: 'space-between',
  },
  cardNumber: {
    fontSize: 24,
    letterSpacing: 2,
  },
  rangeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  summaryCard: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  subCount: {
    marginTop: theme.spacing.sm,
  },
  primaryAction: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
});
