// Drop-in for React Native's `Alert`, rendered by the app itself
// (components/AppAlertHost.tsx) instead of the OS dialog. Same call shape,
// so a call site only swaps the import. Works outside React too (cancellation
// resolver, Plaid hook): the host subscribes to this tiny emitter.

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type AppAlert = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
};

type Listener = (alert: AppAlert) => void;
const listeners = new Set<Listener>();
let seq = 0;

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    const a: AppAlert = { id: ++seq, title, message, buttons: buttons ?? [] };
    if (!listeners.size) console.warn('[appAlert] no host mounted:', title, message);
    listeners.forEach(l => l(a));
  },
};

export function subscribeAlerts(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
