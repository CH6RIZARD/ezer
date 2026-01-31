import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, FlatList } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../src/api/client';

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [merchants, setMerchants] = useState<any[]>([]);

  useEffect(() => {
    if (id) loadMerchants();
  }, [id]);

  const loadMerchants = async () => {
    try {
      const result = await api.getInstrumentMerchants(id as string);
      if (result.success) {
        setMerchants(result.data);
      }
    } catch (error) {
      console.error('Failed to load merchants:', error);
    }
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <View style={styles.container}>
      <ScrollView>
        <Text variant="heading" style={styles.title}>
          Card Drain Detail
        </Text>

        <FlatList
          data={merchants}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Card style={styles.merchantCard}>
              <View style={styles.merchantRow}>
                <View style={styles.merchantInfo}>
                  <Text variant="subheading">{item.merchantName}</Text>
                  <Text variant="caption">
                    {formatCurrency(item.monthlyEquivalentCents)}/mo • {item.chargeCount} charges
                  </Text>
                </View>
                <Text variant="subheading" color={theme.colors.redDrain}>
                  {formatCurrency(item.totalDrainedCents)}
                </Text>
              </View>
            </Card>
          )}
          keyExtractor={(item) => item.merchantId}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.lg,
  },
  merchantCard: {
    marginBottom: theme.spacing.md,
  },
  merchantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  merchantInfo: {
    flex: 1,
  },
});
