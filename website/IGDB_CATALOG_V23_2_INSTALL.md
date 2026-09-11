# ComePlayers V23.2 — IGDB Catalog Migration

V23.2 replaces RAWG as the preferred metadata provider while keeping `public.game_master` as the application source of truth.

## Safety model

- IGDB credentials are server-only.
- Provider records enter `igdb_import_candidates` first.
- Admin approval is required before a candidate is linked or inserted.
- Newly inserted games remain `inactive` and `is_active = false`.
- Existing RAWG, Steam, and manual rows keep their internal `game_master.id`.
- Provider data is stored in shadow columns and raw JSON.
- Admin-controlled fields listed in `local_override_fields` are never overwritten.
- Existing live fields are only filled from IGDB when they are blank.

## 1. Apply the migration

Run after all migrations through V23:

```text
scripts/comeplayers_igdb_catalog_v23_2.sql
```

Expected result:

```text
comeplayers_igdb_catalog_v23_2_ready
```

Verify with:

```text
IGDB_CATALOG_V23_2_VERIFY.sql
```

## 2. Create Twitch/IGDB credentials

Create a confidential Twitch Developer application and keep the secret server-side.

Add to `.env.local` and deployment environment:

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
IGDB_SYNC_ENABLED=true
IGDB_SYNC_BATCH_SIZE=100
IGDB_SYNC_OFFSET=0
IGDB_GAME_TYPES=0
```

Never use a `NEXT_PUBLIC_` prefix for `TWITCH_CLIENT_SECRET`.

## 3. Restart the application

```powershell
npm run typecheck
npm test
npm run dev
```

Open:

```text
/admin/games/igdb
```

## 4. First controlled import

1. Stage 25–50 games at offset 0.
2. Review exact/likely matches carefully.
3. Approve only correct candidates.
4. Apply approved candidates.
5. Open `/admin/games` and activate only marketplace-relevant games.
6. Repeat with the next offset.

## 5. CLI operations

PowerShell-compatible commands:

```powershell
$env:IGDB_SYNC_BATCH_SIZE="100"
$env:IGDB_SYNC_OFFSET="0"
npm run igdb:stage
```

After review and approval:

```powershell
npm run igdb:apply
```

Refresh linked provider records:

```powershell
npm run igdb:sync
```

The CLI uses `.env.local`, so the values can also be stored there instead of being set for every shell session.

## 6. RAWG retirement

Do not delete RAWG data immediately. Retire it only after:

- active legacy games are linked to an IGDB record or marked manual;
- seller listings still reference the same `game_master.id`;
- no runtime route calls RAWG;
- IGDB sync and admin review have been tested;
- `RAWG_API_KEY` is no longer required.

Keep `rawg_id` and legacy source information for audit/reference.

## Important operational notes

- IGDB API access must remain server-side.
- The importer serializes requests and retries temporary failures.
- Admin staging is capped at 100 records per request to reduce serverless timeout risk.
- CLI batches can use up to 500 records, matching the provider request ceiling.
- Do not bulk-activate every IGDB title. ComePlayers should publish only games relevant to its marketplace categories.
