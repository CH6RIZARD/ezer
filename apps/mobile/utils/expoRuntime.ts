import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/** Expo Go and dev builds: do not hard-lock the app behind an undismissable paywall. */
export function isLoosePreviewMode(): boolean {
  return __DEV__ || isExpoGo() || Platform.OS === 'web';
}
