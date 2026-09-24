# CryoChain

One React Native application for CryoChain Ghana. Farmers, buyers, field agents, drivers and operations each get a role inside the same app.

## Run the demo

```bash
npm install
npm test
npm run web
```

Development sign-in is enabled by default. Password for every demo account: `cryochain-dev`.

- farmer@test.com
- offtaker@test.com
- agent@test.com
- driver@test.com
- ops@test.com

Phone sign-in for Akua Boateng uses `0244001001` and development code `123456`. Do not use these accounts in production. Set `EXPO_PUBLIC_ENABLE_DEMO_AUTH=false` before a production build.

Copy `.env.example` to `.env` when you are ready to point the app at real providers. The app runs without those values by using the local database and mock providers.

## What is enforced

- A collection cannot be scheduled until the buyer payment is confirmed.
- Only operations can approve the farmer payout, and only after the buyer accepts delivery.
- The buyer pays CryoChain. Farmer settlement is the consignment gross. No collection fee is deducted from the farmer.
- Field and driver writes are saved locally first and replayed through idempotency keys.

The same rules are covered by `npm test`.

# Agrigrow
