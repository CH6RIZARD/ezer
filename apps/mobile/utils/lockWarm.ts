// Resolves once the passcode is accepted (or there is none). Background work
// that nothing on the lock screen needs (the hourly Plaid re-sync) waits on
// it, so it never competes with the keypad.
let resolveWarm: () => void = () => {};
export const lockWarm = new Promise<void>(r => {
  resolveWarm = r;
});
export const markLockWarm = () => resolveWarm();
