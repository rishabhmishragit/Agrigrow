# CryoChain architecture

CryoChain is one Expo / React Native codebase. After sign-in, the navigator mounts only the signed-in role. Operations uses the same app in a wide layout on web and tablet.

## Boundaries

Business rules live in `src/domain` and do not import React Native. Screens call those commands. They do not calculate settlement amounts.

Provider selection is configuration:

- `PaymentProvider` — mock by default; Nsano, Paystack, Flutterwave and Hubtel shells refuse to invent a live API
- `EscrowProvider` — bank is a label, not a hard-coded institution
- `SMSProvider`
- `USSDProvider` via `handleUssd`, which writes the same listings as the mobile app
- `TrackingProvider` — the driver phone is the custody record; position interval defaults to 120 seconds

## Data

Development and offline use a local database. On Android and iOS that database is SQLite. On web, the same document is stored with AsyncStorage because this Expo SDK's SQLite build does not ship the web assembly file Metro needs. The sync queue lives inside that document either way.

Production authorization is the Supabase schema in `supabase/migrations/001_cryochain.sql`. Row Level Security and the `schedule_collection` / `release_escrow` functions are the server-side gate. The app selects that backend only when `EXPO_PUBLIC_DATA_SOURCE=supabase` and the Supabase URL is set. Until a trust-account bank and payment credentials exist, those adapters stay unconfigured.

## Order

`LISTED → AGGREGATING → LOT_CREATED → COMMITTED → ESCROW_PENDING → ESCROW_FUNDED → COLLECTION_SCHEDULED → FIELD_CONFIRMED → COLLECTED → IN_TRANSIT → DELIVERED → ACCEPTED → ESCROW_RELEASE_REQUESTED → ESCROW_RELEASED → SETTLEMENT_PROCESSING → SETTLED`

Illegal jumps are rejected. Exceptions can leave an active state and are resumed only by operations.

## Open decisions kept open

- Offtaker Version 1 is mobile-first inside this app. A later web dashboard can reuse the domain commands.
- The escrow bank is not chosen. The instruction carries `EXPO_PUBLIC_ESCROW_BANK_LABEL`.
- The managed backend is Supabase. This repository does not add a custom server.
