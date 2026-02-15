const base = require('./app.json');

// react-native-purchases does not ship an Expo config plugin (no app.plugin.js).
// Do not add it to plugins; the app uses it at runtime on native only.
const plugins = [
  'expo-router',
  'expo-image-picker',
  ['expo-build-properties', {
    android: {
      minSdkVersion: 24,
      compileSdkVersion: 36,
      targetSdkVersion: 35,
      usesCleartextTraffic: true,
    },
  }],
];

module.exports = {
  ...base.expo,
  plugins,
};
