import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { api } from './api';

export type PlaidAccount = {
  id: string;
  name: string;
  mask: string;
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
  error?: { errorCode: string; errorMessage: string };
};

type PlaidState = {
  isLoading: boolean;
  linkedAccounts: PlaidAccount[];
  error: string | null;
};

// Dynamic import so Expo Go doesn't crash (PlaidLink is a native module)
let PlaidLink: any = null;
try {
  PlaidLink = require('react-native-plaid-link-sdk');
} catch {}

export function usePlaid() {
  const [state, setState] = useState<PlaidState>({
    isLoading: false,
    linkedAccounts: [],
    error: null,
  });

  const openPlaidLink = useCallback(
    async (
      onSuccess?: (result: PlaidLinkSuccess) => void,
      onExit?: (result: PlaidLinkExit) => void
    ) => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const res: any = await api.post('/plaid/create-link-token');
        const linkToken: string = res.data.linkToken;

        if (!PlaidLink || !PlaidLink.open) {
          // Running in Expo Go — can't open native Plaid Link
          Alert.alert(
            'Bank Linking',
            'Bank linking requires a development build (not Expo Go). Run `eas build --profile development` to enable it.',
            [{ text: 'OK' }]
          );
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        PlaidLink.open({
          tokenConfig: {
            token: linkToken,
            noLoadingState: false,
          },
          onSuccess: async (success: any) => {
            const accounts: PlaidAccount[] = (success.metadata?.accounts || []).map((a: any) => ({
              id: a.id,
              name: a.name,
              mask: a.mask,
              type: a.type,
              subtype: a.subtype,
              institutionId: success.metadata?.institution?.id || '',
              institutionName: success.metadata?.institution?.name || '',
            }));

            try {
              await api.post('/plaid/exchange-public-token', {
                publicToken: success.publicToken,
                institutionId: success.metadata?.institution?.id || '',
                institutionName: success.metadata?.institution?.name || '',
                accounts,
              });

              setState(prev => ({
                ...prev,
                isLoading: false,
                linkedAccounts: [...prev.linkedAccounts, ...accounts],
              }));

              onSuccess?.({
                publicToken: success.publicToken,
                accounts,
                institutionId: success.metadata?.institution?.id || '',
                institutionName: success.metadata?.institution?.name || '',
              });
            } catch (err: any) {
              setState(prev => ({ ...prev, isLoading: false, error: err.message }));
            }
          },
          onExit: (exit: any) => {
            setState(prev => ({ ...prev, isLoading: false }));
            onExit?.(exit);
          },
        });
      } catch (err: any) {
        console.log('[usePlaid] error:', err.message);
        setState(prev => ({ ...prev, isLoading: false, error: err.message }));
      }
    },
    []
  );

  const syncAccounts = useCallback(async () => {
    try {
      await api.post('/plaid/sync');
    } catch (err: any) {
      console.log('[usePlaid] sync error:', err.message);
    }
  }, []);

  const fetchLinkedAccounts = useCallback(async () => {
    try {
      const res: any = await api.get('/plaid/accounts');
      const accounts: PlaidAccount[] = (res.data || []).flatMap((item: any) =>
        (item.accounts || []).map((a: any) => ({
          id: a.account_id || a.id,
          name: a.name,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype,
          institutionId: item.institutionId || '',
          institutionName: item.institutionName || '',
        }))
      );
      setState(prev => ({ ...prev, linkedAccounts: accounts }));
    } catch (err: any) {
      console.log('[usePlaid] fetch accounts error:', err.message);
    }
  }, []);

  const clearError = useCallback(() => setState(prev => ({ ...prev, error: null })), []);

  return {
    ...state,
    openPlaidLink,
    syncAccounts,
    fetchLinkedAccounts,
    clearError,
  };
}

export default usePlaid;
