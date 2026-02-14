// =============================================================================
// EZER Mobile App - Plaid Integration Hook
// Manages Plaid Link flow for connecting bank accounts
// =============================================================================

import { useState, useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';

// Types for Plaid integration
export type PlaidLinkToken = string;

export type PlaidAccount = {
  id: string;
  name: string;
  mask: string; // last 4 digits
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'other';
  subtype: string;
  institutionId: string;
  institutionName: string;
};

export type PlaidLinkSuccess = {
  publicToken: string;
  accounts: PlaidAccount[];
  institutionId: string;
  institutionName: string;
};

export type PlaidLinkExit = {
  error?: {
    errorCode: string;
    errorMessage: string;
  };
};

type PlaidState = {
  isLoading: boolean;
  isLinkOpen: boolean;
  linkToken: PlaidLinkToken | null;
  linkedAccounts: PlaidAccount[];
  error: string | null;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// Mock accounts for demo when Plaid is not configured
const MOCK_ACCOUNTS: PlaidAccount[] = [
  {
    id: 'mock_chase_1',
    name: 'Chase Checking',
    mask: '4521',
    type: 'checking',
    subtype: 'checking',
    institutionId: 'ins_3',
    institutionName: 'Chase',
  },
  {
    id: 'mock_bofa_1',
    name: 'Bank of America Savings',
    mask: '8832',
    type: 'savings',
    subtype: 'savings',
    institutionId: 'ins_4',
    institutionName: 'Bank of America',
  },
];

export function usePlaid() {
  const [state, setState] = useState<PlaidState>({
    isLoading: false,
    isLinkOpen: false,
    linkToken: null,
    linkedAccounts: MOCK_ACCOUNTS, // Start with mock data for demo
    error: null,
  });

  // Fetch a link token from the backend
  const fetchLinkToken = useCallback(async (): Promise<string | null> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${API_URL}/api/plaid/create-link-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: Platform.OS,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create link token');
      }

      const data = await response.json();
      setState(prev => ({ ...prev, linkToken: data.linkToken, isLoading: false }));
      return data.linkToken;
    } catch (error) {
      console.log('[usePlaid] Plaid not configured, using demo mode');
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Plaid integration not configured',
      }));
      return null;
    }
  }, []);

  // Exchange public token for access token (called after successful link)
  const exchangePublicToken = useCallback(async (publicToken: string, accounts: PlaidAccount[]): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch(`${API_URL}/api/plaid/exchange-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicToken,
          accounts,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to exchange token');
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        linkedAccounts: [...prev.linkedAccounts, ...accounts],
      }));

      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to link account',
      }));
      return false;
    }
  }, []);

  // Open Plaid Link (for react-native-plaid-link-sdk integration)
  const openPlaidLink = useCallback(async (onSuccess?: (result: PlaidLinkSuccess) => void, onExit?: (result: PlaidLinkExit) => void) => {
    // First try to fetch a link token
    const linkToken = await fetchLinkToken();

    if (!linkToken) {
      // Plaid not configured - show demo alert
      Alert.alert(
        'Plaid Integration',
        'To connect real bank accounts:\n\n' +
        '1. Install react-native-plaid-link-sdk\n' +
        '2. Add PLAID_CLIENT_ID and PLAID_SECRET to .env\n' +
        '3. Set FEATURE_PLAID=true\n' +
        '4. Implement /api/plaid endpoints\n\n' +
        'For now, demo accounts are pre-connected.',
        [
          {
            text: 'Learn More',
            onPress: () => Linking.openURL('https://plaid.com/docs/link/react-native/'),
          },
          {
            text: 'Use Demo',
            style: 'default',
            onPress: () => {
              // Simulate successful connection with demo account
              if (onSuccess) {
                onSuccess({
                  publicToken: 'demo_public_token',
                  accounts: MOCK_ACCOUNTS,
                  institutionId: 'ins_demo',
                  institutionName: 'Demo Bank',
                });
              }
            },
          },
        ]
      );
      return;
    }

    // In a real implementation with react-native-plaid-link-sdk:
    // PlaidLink.open({
    //   tokenConfig: { token: linkToken },
    //   onSuccess: (result) => {
    //     exchangePublicToken(result.publicToken, result.accounts);
    //     onSuccess?.(result);
    //   },
    //   onExit: (exit) => {
    //     onExit?.(exit);
    //   },
    // });

    setState(prev => ({ ...prev, isLinkOpen: true }));
  }, [fetchLinkToken]);

  // Add a mock account (for demo purposes)
  const addMockAccount = useCallback((account: PlaidAccount) => {
    setState(prev => ({
      ...prev,
      linkedAccounts: [...prev.linkedAccounts, account],
    }));
  }, []);

  // Remove an account
  const removeAccount = useCallback((accountId: string) => {
    setState(prev => ({
      ...prev,
      linkedAccounts: prev.linkedAccounts.filter(acc => acc.id !== accountId),
    }));
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    openPlaidLink,
    exchangePublicToken,
    addMockAccount,
    removeAccount,
    clearError,
  };
}

export default usePlaid;
