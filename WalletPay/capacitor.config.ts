import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mx.aetherpay.wallet',
  appName: 'AetherPay Wallet',
  webDir: 'www',
  server: {
    androidScheme: 'http',
    cleartext: true,
    iosScheme: 'capacitor'
  },
  plugins: {
    StatusBar: {
      style: 'DARK'
    }
  }
};

export default config;

