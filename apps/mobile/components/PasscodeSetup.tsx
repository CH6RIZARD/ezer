// =============================================================================
// EZER — choose a passcode: enter 4–6 digits, then the same again.
// Used as onboarding's last step and by LockGate for a signed-in account that
// has none (anyone who signed up before passcodes existed).
// =============================================================================

import React, { useRef, useState } from 'react';
import PasscodePad, { type PadPalette } from './PasscodePad';
import { setPasscode } from '../utils/passcode';

export function PasscodeSetup({
  palette,
  onDone,
  header,
}: {
  palette: PadPalette;
  onDone: () => void;
  header?: React.ReactNode;
}) {
  const [stage, setStage] = useState<'create' | 'confirm'>('create');
  const [message, setMessage] = useState<string | null>(null);
  const first = useRef('');

  const submit = async (code: string) => {
    if (stage === 'create') {
      first.current = code;
      setMessage(null);
      setStage('confirm');
      return true;
    }
    if (code !== first.current) {
      first.current = '';
      setStage('create');
      setMessage("Those didn't match. Choose a passcode again.");
      return false;
    }
    try {
      await setPasscode(code);
    } catch (err: any) {
      setMessage(err?.message ?? 'Could not save your passcode. Try again.');
      first.current = '';
      setStage('create');
      return false;
    }
    onDone();
    return true;
  };

  return (
    <PasscodePad
      // A fresh pad per stage, so the confirm step starts with no digits and
      // knows the length it is matching.
      key={stage}
      palette={palette}
      header={header}
      title={stage === 'create' ? 'Set a passcode' : 'Confirm your passcode'}
      subtitle={
        stage === 'create'
          ? '4 to 6 digits. You will enter it each time you open EZER.'
          : 'Enter the same digits again.'
      }
      length={stage === 'confirm' ? first.current.length : undefined}
      onSubmit={submit}
      message={message}
    />
  );
}

export default PasscodeSetup;
