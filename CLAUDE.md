# CLAUDE.md — Budget app architecture & code map

A local-first, Mint-style budgeting app. **Bare React Native (iOS), TypeScript.**
Links real banks via **Plaid v13**, stores everything on-device in **SQLite**
(`@op-engineering/op-sqlite`), and shows accounts, transactions, budgets,
spending-insight charts, recurring/bills detection, and a net-worth-over-time graph.

> This file is the map. Scan it first to find where things live before editing.
> Keep it in sync when you add/rename modules or exported functions.

## Stack & key facts
- RN **0.88**, React **19.3**, TypeScript. iOS only. New Architecture (Fabric) on.
- **Plaid SDK v13** (`react-native-plaid-link-sdk`): session API —
  `createPlaidLinkSession({token,onSuccess,onExit,onEvent})` then `session.open()`.
  Built on **Expo Modules** (so `expo` + `expo-modules-core` are deps; NOT the Expo
  managed framework — no EAS/subscription needed to build or ship).
- **SQLite**: op-sqlite. Repo layer is **synchronous** and uses op-sqlite's
  `executeSync` (NOT async `execute`). See `src/db/db.ts`.
- **Charts**: `react-native-gifted-charts` (needs `react-native-svg`, `react-native-linear-gradient`).
- **Amount convention (Plaid)**: `amount > 0` = money OUT (spend), `amount < 0` = money IN.
- **Secrets**: real Plaid Production creds in gitignored `plaid.config.ts`
  (template: `plaid.config.example.ts`; test stub: `__mocks__/plaid.config.ts`).

## Data flow (one direction)
```
Plaid REST  ──> src/plaid/{client,linking,sync,recurring}  ──> src/db/repositories ──> SQLite
                                                                      │
UI screens ──reads via──> useAppData() (src/context) ──queries──> repositories
UI actions (link/refresh) ──> context ──> plaid/* ──> repositories ──> bumpVersion() ──> re-query
```
`AppDataContext` holds the single DB handle + Plaid client and a `version` counter;
screens re-run their `useMemo` queries whenever `version` changes.

## Build / run / test
- Run: `npx react-native start` (Metro) + `npx react-native run-ios`.
- Native deps: `cd ios && pod install` (CocoaPods at `/opt/homebrew/lib/ruby/gems/4.0.0/bin`).
- Tests: `npm test` (Jest, 41 tests / 8 suites). Types: `npm run typecheck`.
- Gotchas: iOS deploy target **16.4** (Expo req, in Podfile + project.pbxproj);
  `expo-modules-core` must be a **top-level** dep for Metro; after any Expo-module
  hoist, **re-run `pod install`**. `SceneDelegate` must use **`ExpoReactNativeFactory`**
  / `ExpoReactNativeFactoryDelegate` (not the plain RCT ones) or Expo modules
  (Plaid) throw `EventEmitter of undefined`.

---

## Directory tree (annotated)

```
budget-app/
├── App.tsx                      SafeAreaProvider > AppDataProvider > NavigationContainer > RootTabs
├── index.js                     RN entry (registers App)
├── plaid.config.ts              GITIGNORED real creds {clientId, secret, env:'production'}
├── plaid.config.example.ts      Template to copy -> plaid.config.ts
├── ios/
│   ├── Podfile                  platform :ios '16.4'; use_expo_modules!
│   └── BudgetApp/
│       ├── AppDelegate.swift    Minimal stub
│       └── SceneDelegate.swift  Boots RN via ExpoReactNativeFactory (REQUIRED for Expo modules)
├── src/
│   ├── navigation/RootTabs.tsx  Bottom tabs: Accounts / Transactions / Budgets / Insights
│   ├── context/AppDataContext.tsx   App-wide DB + Plaid client + link/refresh actions + version
│   ├── screens/                 One file per tab (see below)
│   ├── components/              Reusable UI (ScreenContainer, EmptyState, NetWorthChart)
│   ├── db/                      SQLite: types, open+migrate, migrations, repositories
│   ├── plaid/                   Plaid REST client, link flow, sync engine, recurring, category map, config
│   ├── theme/colors.ts          Palette (mint #1AAE6F) + chart color array
│   ├── types/                   models.ts (domain) + navigation.ts (nav params)
│   └── utils/format.ts          Currency/date/month/range formatters
├── __mocks__/                   op-sqlite (node:sqlite-backed), plaid SDK, plaid.config stub
└── __tests__/                   Jest suites (see Tests section)
```

---

## Modules & exported symbols (compact)

### Data layer — `src/db/`
- **types.ts** — `Database` {execute, executeBatch, transaction, close}, `QueryResult<Row>`.
- **db.ts** — `getDatabase()` singleton (op-sqlite open, WAL+FK pragmas, runs migrations, uses **executeSync**); `adapt(conn)`; `_resetDatabaseSingleton()` (tests).
- **migrations.ts** — `MIGRATIONS[]` (v1 schema, v2 recurring_streams, v3 net_worth_snapshots), `runMigrations(db)` (idempotent), `seedCategories(db)`, `SEED_CATEGORIES`, `Migration`.
- **repositories.ts** — all CRUD + aggregations (synchronous, take `db`):
  - `ItemsRepo` { upsert, all, setCursor, getCursor }
  - `AccountsRepo` { upsert, all, _map, **netWorth** (assets − liabilities) }
  - `NetWorthRepo` { snapshot(nw,date?), since(date), all, **reconstructHistory(nw)** (window-fn backfill) }
  - `CategoriesRepo` { all, create(name,parent)→id, findByName }
  - `TransactionsRepo` { upsert, remove, setCategory, _map, list({limit,offset,search}) }
  - `BudgetsRepo` { setLimit(catId,month,amt), forMonth(month) }
  - fns: `spendByCategory(db,month)`, `spendByMonth(db,monthsBack=6)`, `budgetProgress(db,month)`
  - Aggregations exclude pending + Income/Transfer; `amount>0` counts as spend.

### Plaid integration — `src/plaid/`
- **config.ts** — `PlaidConfig`, `PlaidEnv`, `plaidBaseUrl(env)`.
- **index.ts** — `getPlaidClient()` singleton (reads gitignored `../../plaid.config`).
- **client.ts** — `createPlaidClient(config, fetchImpl=fetch)` → { `createLinkToken(userId)`, `exchangePublicToken(publicToken)`, `getAccounts(accessToken)`, `transactionsSync(accessToken,cursor)`, `transactionsRecurringGet(accessToken)` }; `PlaidError{message,code,status}`; response types `Plaid*` / `*Response`. Injects client_id+secret per request.
- **linking.ts** — `openLinkAndPersist({db,client,userId,onError})` (v13 session → persist, returns itemId|null); `persistLinkedItem(db,client,publicToken,instName)` (exchange+getAccounts+persist in txn); `mapPlaidAccount(a,itemId)`; `LinkSuccessMetadata`.
- **sync.ts** — `syncItem(db,client,itemId,accessToken)` (paginates `/transactions/sync`, applies added/modified/removed, advances cursor); `syncAll(db,client)`; `syncRecurring(db,client)` (Plaid streams, heuristic fallback); `SyncResult`.
- **recurring.ts** — `detectRecurringHeuristic(txns)` (group→cadence→stability); `mapPlaidRecurring(resp)`, `mapPlaidStream(s,dir)`; `estimateNextDate(lastDate,freq)`.
- **categoryMap.ts** — `mapPlaidCategory(primary)` → local category name (default 'Uncategorized').

### State — `src/context/AppDataContext.tsx`
- `AppDataProvider` + `useAppData()` → { db, version, linking, syncing, error, `linkAccount()`, `refresh()`, `bumpVersion()` }. link/refresh run sync → syncRecurring → NetWorthRepo.snapshot + reconstructHistory → bumpVersion.

### Screens — `src/screens/` (each a default-ish `export function`)
- **AccountsScreen** — net-worth card + `<NetWorthChart>` + accounts grouped by institution + Link/Refresh. testIDs: `accounts-empty|link|refresh`.
- **TransactionsScreen** — search (`tx-search`), feed (`tx-<id>`), category modal (`cat-<name>`).
- **BudgetsScreen** — month switcher (`budget-prev/next-month`), progress bars, set-limit modal (`budget-add|cat-<name>|limit-input|save`).
- **InsightsScreen** — gifted-charts pie (`insights-pie`) + bar (`insights-bar`) + recurring list (`insights-recurring`).

### Components — `src/components/`
- **NetWorthChart.tsx** — `NetWorthChart({db,version})`: range pills 1W/1M/3M/1Y/ALL (`networth-range-<R>`), area LineChart (~40% usable height, clipped), delta label, `compactCurrency()` y-labels, positive-offset trick for negatives. testIDs: `networth-chart|insufficient`.
- **ScreenContainer.tsx** — `ScreenContainer({title,children})` (safe-area + header).
- **EmptyState.tsx** — `EmptyState({title,message,actionLabel?,onAction?,testID?})`.

### Types / theme / utils
- **types/models.ts** — `Item, Account(+AccountType), Transaction, Category, Budget`, aggregations `CategorySpend/MonthSpend/BudgetProgress`, `NetWorthPoint`, `RecurringStream(+RecurringFrequency/Direction)`.
- **types/navigation.ts** — `RootTabParamList`.
- **theme/colors.ts** — `colors` (+ `colors.chart[]`), `AppColors`.
- **utils/format.ts** — `formatCurrency`, `currentMonthKey`, `monthKeyFromDate`, `monthLabel`, `shiftMonth`, `rangeStartDate(range,now?)`, `shortDate`, `DateRangeKey`.

---

## SQLite schema (migrations.ts)
- **items**(item_id PK, access_token, institution_name, sync_cursor, created_at)
- **accounts**(account_id PK, item_id FK, name, official_name, mask, type, subtype, current_balance, available_balance, iso_currency)
- **categories**(category_id PK, name UNIQUE, parent, is_custom)
- **transactions**(transaction_id PK, account_id FK, date, name, merchant_name, amount, pending, category_id FK, iso_currency)
- **budgets**(budget_id PK, category_id FK, month, limit_amount, UNIQUE(category_id,month))
- **recurring_streams**(stream_id PK, description, merchant_name, direction, frequency, last_amount, average_amount, last_date, next_date, is_active, source)
- **net_worth_snapshots**(date PK, net_worth, created_at)
- Indexes: idx_tx_{date,account,category}, idx_accounts_item, idx_budgets_month, idx_recurring_next, idx_nws_date.

## Tests — `__tests__/` (8 suites, 41 tests)
- **migrations** schema/seed/idempotency · **repositories** CRUD+aggregations ·
  **plaidClient** endpoints/errors (mocked fetch) · **linkingSync** persist + sync pagination + pending→posted ·
  **recurring** heuristic + Plaid map + next-date · **networth** snapshots + reconstruction + range helpers ·
  **screens** tx-categorize, budget set-limit, insights charts, accounts net-worth chart · **App** smoke (4 tabs).
- Pattern: tests build a `makeDb()` over `__mocks__/op-sqlite.ts` (real `node:sqlite`), so repo/SQL logic is tested for real. RNTL v14 → `await render()` + `screen` queries.

## Where to make common changes
- New screen/tab → `src/screens/` + register in `src/navigation/RootTabs.tsx` + `RootTabParamList`.
- New DB field/table → add a migration in `src/db/migrations.ts` (bump version) + repo method + model type.
- New Plaid endpoint → `src/plaid/client.ts` (method + response type) + consume in `sync.ts`/`linking.ts`.
- New aggregation/chart → repo fn in `repositories.ts` + render in the relevant screen/component.
- Styling/colors → `src/theme/colors.ts`; formatting → `src/utils/format.ts`.
