# Budget — a local-first Mint-style budgeting app

Bare React Native (iOS) app that links real bank accounts via **Plaid** (v13 SDK),
stores everything **locally in SQLite** (op-sqlite), and shows account balances,
a transaction feed, budgets, and spending-insight charts.

- **Platform:** iOS only
- **Data:** 100% on-device SQLite (no backend)
- **Bank data:** Plaid Production via `/link/token/create`, `/item/public_token/exchange`,
  `/accounts/get`, `/transactions/sync` (cursor-based incremental sync)
- **Charts:** react-native-gifted-charts (donut + bar)

> **Security note:** This is a single-user personal build, so the Plaid
> `client_id`/`secret` are embedded on-device (in gitignored `plaid.config.ts`).
> This is NOT safe for a distributed app — shipping to other users would require
> moving the secret to a server-side token-exchange proxy.

## Requirements

- Node 20+ (built with Node 24), Xcode 16.1+ (built with Xcode 27.1), CocoaPods
- An iOS Simulator runtime installed (`xcodebuild -downloadPlatform iOS`)
- Plaid Production `client_id` + `secret`

## One-time setup

```sh
npm install

# Plaid credentials (gitignored):
cp plaid.config.example.ts plaid.config.ts
#   then edit plaid.config.ts and set clientId / secret / env: 'production'

# iOS native deps (Plaid v13 + op-sqlite are Expo Modules; the Podfile wires
# Expo autolinking automatically):
cd ios && pod install && cd ..
```

## Run

```sh
# 1) Start Metro (JS bundler) in one terminal:
npx react-native start

# 2) Build + launch on a simulator in another terminal:
npx react-native run-ios
```

Then on the **Accounts** tab tap **Link account**, choose your bank, and complete
the real Plaid Link login (this is the one step that must be done by hand with
your bank credentials). After linking, the app runs an initial transaction sync;
pull **Refresh** on Accounts to sync again later.

## Test

```sh
npm test          # Jest unit/integration + screen tests (26 tests)
npm run typecheck # tsc --noEmit
```

Tests run the SQLite layer against Node's built-in `node:sqlite` (via a jest mock
of op-sqlite), so repository logic and aggregations are tested with real SQL.
Plaid and the native Link SDK are mocked; the Plaid REST client was additionally
verified live against Production.

## Project layout

```
src/
  db/           SQLite handle, versioned migrations, repositories + aggregations
  plaid/        REST client, Link flow, sync engine, category mapping, config
  context/      AppDataProvider (db + plaid client + link/sync actions)
  screens/      Accounts, Transactions, Budgets, Insights
  components/   ScreenContainer, EmptyState
  theme/ utils/ types/
```

## Notes / gotchas captured during setup

- **iOS deployment target is 16.4** (both Podfile and the app target in
  `project.pbxproj`) because every Expo Module requires 16.4.
- **`expo-modules-core` is a top-level dependency** so Metro's JS resolver can
  find it (Plaid v13 imports it). If you hit "Unable to resolve module
  expo-modules-core", reinstall it and restart Metro with `--reset-cache`.
- "Expo" here is only the open-source **Expo Modules** native runtime that Plaid
  v13 requires — not the Expo managed framework. No Expo account, EAS, or
  subscription is needed to build or ship to the App Store.

## Roadmap

- P2: recurring/bills detection (heuristic or Plaid `/transactions/recurring/get`)
