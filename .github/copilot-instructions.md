# Copilot instructions — milk_collection_supply_chain_system

- Stack: Next.js (App Router) + TypeScript, MySQL (via XAMPP/MariaDB) accessed through `lib/db.ts` / `lib/data-layer.ts`, Firebase auth (`components/auth/auth-provider.tsx`, `lib/firebase/config.ts`).
- Business domain: milk collection & supply chain — farmers, cows/animals, collections, batches, quality tests, payments, veterinary records, cow-registration OTP authorization workflow.
- DB schema: `db/init.sql` is the base schema; `db/migrations/*.sql` are idempotent incremental ALTERs. **Migrations are NOT auto-applied** — verify columns exist before assuming a feature works, and apply with:
  `Get-Content db\migrations\<file>.sql | C:\xampp\mysql\bin\mysql.exe -u root new_milk`
- Rwanda administrative address hierarchy (province/district/sector/cell/village) must be fully imported (see `scripts/import-rwanda-locations.mjs`) — `createFarmer` in `lib/data-layer.ts` requires the full combo to resolve to a real village row.
- Server actions/API: all client calls go through `app/api/system/route.ts`, dispatching by `action` name to functions in `lib/data-layer.ts`.
- Read `node_modules/next/dist/docs/` for current Next.js API/conventions before writing code — this project pins a Next.js version with breaking changes vs. common training data.
## Naming conventions

- **DB tables/columns**: `snake_case`, plural table names (`farmers`, `cow_registration_batches`), singular FK columns (`farmer_id`, `batch_id`).
- **TypeScript types/interfaces**: `PascalCase` (`Farmer`, `CowRegistrationAuthorization`, `AppState`), fields in `camelCase` even when the DB column is `snake_case` — data-layer functions do the mapping (e.g. `otp_code` → `otpCode`).
- **`lib/data-layer.ts` functions**: verb-first `camelCase` describing the DB operation: `list*` (read all), `create*`, `update*`, `delete*`, `verify*`, `cancel*`, `resend*` (e.g. `listFarmers`, `createCowRegistrationBatch`, `cancelCowRegistrationBatch`).
- **API `action` values** (`app/api/system/route.ts`): `camelCase`, and match the `lib/data-layer.ts` function name they call 1:1 (e.g. action `"cancelCowRegistrationBatch"` → `cancelCowRegistrationBatch()`).
- **IDs**: human-readable prefixed strings, not UUIDs — `COW-BATCH-<timestamp>`, `AUTH-SESSION-<timestamp>-<rand>`, `A-<timestamp>-<index>` for client-generated animal IDs.
- **React component state**: `camelCase`, paired `useState` names read like `<noun><Verb>` / `<noun>Draft` / `<noun>Backup` (e.g. `cowBatchCows`, `cowDraft`, `cowBatchBackup`, `cowBatchBusy`).
- **SQL migration files**: `db/migrations/YYYY_MM_DD_<snake_case_description>.sql`, always idempotent (`ADD COLUMN IF NOT EXISTS`, etc.).
## Credentials & secrets

- Never hardcode credentials, API keys, or connection strings in source files — read them from `process.env` only (see `lib/db.ts`, `lib/firebase/config.ts`).
- MySQL: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`. The `root` / empty-password defaults in `lib/db.ts` are for local XAMPP dev only — never propose them for any non-local environment.
- Firebase: `NEXT_PUBLIC_FIREBASE_*` vars in `lib/firebase/config.ts`. These are `NEXT_PUBLIC_*` (client-exposed) by Firebase's own design — do not add server-only secrets to this `NEXT_PUBLIC_*` group.
- Do not print, log, or commit real `.env`/`.env.local` values, MySQL passwords, or Firebase keys in code, comments, commit messages, or chat output.
- If a task needs a new secret, add it as a `process.env.<NAME>` reference and ask the user to set it in their local `.env.local` — do not invent placeholder secrets that look real.