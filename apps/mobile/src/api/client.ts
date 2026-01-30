import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

const client = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  // Auth
  async devLogin(provider: 'google' | 'apple' | 'microsoft') {
    const { data } = await client.post('/simulator/dev-login', { provider });
    if (data.success && data.data.token) {
      await AsyncStorage.setItem('authToken', data.data.token);
    }
    return data;
  },

  async mockInbox(provider: 'gmail' | 'outlook') {
    const { data } = await client.post('/simulator/mock-inbox', { provider });
    return data;
  },

  // Home
  async getHomeSummary() {
    const { data } = await client.get('/home/summary');
    return data;
  },

  // Wallet
  async getInstruments() {
    const { data } = await client.get('/wallet/instruments');
    return data;
  },

  async getInstrumentSummary(id: string, range?: string) {
    const { data } = await client.get(`/wallet/instruments/${id}/summary`, {
      params: { range },
    });
    return data;
  },

  async getInstrumentMerchants(id: string, range?: string) {
    const { data } = await client.get(`/wallet/instruments/${id}/merchants`, {
      params: { range },
    });
    return data;
  },

  // Core
  async getRisks(days?: number) {
    const { data } = await client.get('/risks', { params: { days } });
    return data;
  },

  async getTrials() {
    const { data } = await client.get('/trials');
    return data;
  },

  async createTrialDecision(trialId: string, decision: any) {
    const { data } = await client.post(`/trials/${trialId}/decision`, decision);
    return data;
  },

  async getSubscriptions() {
    const { data } = await client.get('/subscriptions');
    return data;
  },

  async getSubscriptionDetail(id: string) {
    const { data } = await client.get(`/subscriptions/${id}`);
    return data;
  },

  // Cancel
  async cancelSubscription(id: string, reason?: string) {
    const { data } = await client.post(`/subscriptions/${id}/cancel`, { reason });
    return data;
  },

  async uploadProof(attemptId: string, file: FormData) {
    // Let axios/React Native set the Content-Type (including boundary)
    const { data } = await client.post(`/cancel-attempts/${attemptId}/proof`, file);
    return data;
  },

  async confirmCancel(attemptId: string, confirmed: boolean, notes?: string) {
    const { data } = await client.post(`/cancel-attempts/${attemptId}/confirm`, {
      confirmed,
      notes,
    });
    return data;
  },
};

export default client;
