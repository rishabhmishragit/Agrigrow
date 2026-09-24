export const config = {
  dataSource: process.env.EXPO_PUBLIC_DATA_SOURCE ?? "local",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  demoAuth: (process.env.EXPO_PUBLIC_ENABLE_DEMO_AUTH ?? "true") !== "false",
  demoPassword: process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? "cryochain-dev",
  demoOtp: "123456",
  paymentProvider: process.env.EXPO_PUBLIC_PAYMENT_PROVIDER ?? "mock",
  paymentApiKey: process.env.EXPO_PUBLIC_PAYMENT_API_KEY,
  escrowProvider: process.env.EXPO_PUBLIC_ESCROW_PROVIDER ?? "mock",
  escrowApiUrl: process.env.EXPO_PUBLIC_ESCROW_API_URL,
  escrowBankLabel:
    process.env.EXPO_PUBLIC_ESCROW_BANK_LABEL ??
    "External bank trust account (bank not yet selected)",
  smsProvider: process.env.EXPO_PUBLIC_SMS_PROVIDER ?? "mock",
  smsApiKey: process.env.EXPO_PUBLIC_SMS_API_KEY,
  ussdProvider: process.env.EXPO_PUBLIC_USSD_PROVIDER ?? "mock",
  trackingIntervalSeconds: Number(process.env.EXPO_PUBLIC_TRACKING_INTERVAL_SECONDS ?? "120"),
  mapsApiKey: process.env.EXPO_PUBLIC_MAPS_API_KEY ?? "",
};
