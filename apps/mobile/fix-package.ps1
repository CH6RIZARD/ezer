# Restore apps/mobile/package.json (run from repo root: .\apps\mobile\fix-package.ps1)
$json = @'
{
  "name": "@ezer/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "expo-go": "expo start --dev-client"
  },
  "dependencies": {
    "@expo/vector-icons": "15.0.3",
    "@react-navigation/bottom-tabs": "7.10.1",
    "@react-navigation/native": "7.1.28",
    "expo": "54.0.32",
    "expo-font": "14.0.11",
    "expo-image-picker": "17.0.10",
    "expo-router": "6.0.22",
    "expo-status-bar": "3.0.9",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "react-native-chart-kit": "6.12.0",
    "react-native-gesture-handler": "2.28.0",
    "react-native-safe-area-context": "5.6.2",
    "react-native-screens": "4.16.0",
    "react-native-svg": "15.12.1",
    "react-native-web": "0.21.2"
  },
  "devDependencies": {
    "@babel/core": "7.28.6",
    "@types/react": "19.1.17",
    "babel-preset-expo": "54.0.10",
    "typescript": "5.9.3"
  }
}
'@
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
[System.IO.File]::WriteAllText("$dir\package.json", $json)
Write-Host "Wrote package.json"
