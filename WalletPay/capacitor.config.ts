import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mx.aetherpay.wallet',
  appName: 'WalletPay',
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

