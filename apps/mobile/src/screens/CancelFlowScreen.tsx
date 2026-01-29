import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Button, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../api/client';
import * as ImagePicker from 'expo-image-picker';

export default function CancelFlowScreen({ route, navigation }: any) {
  const { subscriptionId } = route.params;
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStartCancel = async () => {
    setLoading(true);
    try {
      const result = await api.cancelSubscription(subscriptionId);
      if (result.success) {
        setAttemptId(result.data.id);
        Alert.alert('Instructions', 'Follow the steps to cancel your subscription');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadProof = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && attemptId) {
      const formData = new FormData();
      formData.append('file', {
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: 'proof.jpg',
      } as any);

      try {
        await api.uploadProof(attemptId, formData);
        Alert.alert('Success', 'Proof uploaded');
      } catch (error: any) {
        Alert.alert('Error', error.message);
      }
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <Text variant="heading" style={styles.title}>
          Cancel Subscription
        </Text>

        {!attemptId ? (
          <Button
            variant="danger"
            size="lg"
            onPress={handleStartCancel}
            loading={loading}
          >
            Start Cancellation
          </Button>
        ) : (
          <>
            <Card style={styles.card}>
              <Text variant="subheading">Steps:</Text>
              <Text variant="body">1. Visit cancellation page</Text>
              <Text variant="body">2. Complete cancellation</Text>
              <Text variant="body">3. Upload proof</Text>
            </Card>

            <Button variant="primary" size="lg" onPress={handleUploadProof}>
              Upload Proof
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
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.lg,
  },
});
