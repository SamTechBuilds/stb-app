import type { CapacitorConfig } from "@capacitor/cli";

// The Android app bundles the built website (dist/) inside the APK and runs it locally from
// https://localhost. It does NOT load the hosted STB Website. Data comes from STB Core over HTTPS.
const config: CapacitorConfig = {
  appId: "com.samtechbuilds.stbapp",
  appName: "STB App",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.STB_ANDROID_DEBUG === "1",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#1E2A5A",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
    },
  },
};

export default config;
