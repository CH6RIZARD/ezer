// Expo loads THIS file, not app.json, whenever both exist. app.json supplies the
// static fields (name, version, ios/android identifiers) via `base` below, but
// `plugins` is rebuilt here from scratch and REPLACES anything app.json declares.
//
// A `targetSdkVersion: 36` was once added to app.json's expo-build-properties
// block and changed nothing: the bundle built from it still targeted API 35 and
// Play rejected the upload, because no build ever read that array. app.json
// therefore no longer declares `plugins` at all. Do not put it back — change
// build properties HERE.

const base = require('./app.json');

// react-native-purchases does not ship an Expo config plugin (no app.plugin.js).
// Do not add it to plugins; the app uses it at runtime on native only.
const plugins = [
  'expo-router',
  'expo-image-picker',
  // Native Google Sign-In and the system browser both need config plugins, or
  // the modules compile in but fail at runtime on device.
  '@react-native-google-signin/google-signin',
  'expo-web-browser',
  ['expo-build-properties', {
    android: {
      minSdkVersion: 24,
      compileSdkVersion: 36,
      targetSdkVersion: 36,
      usesCleartextTraffic: true,
    },
  }],
];

module.exports = {
  ...base.expo,
  plugins,
};
