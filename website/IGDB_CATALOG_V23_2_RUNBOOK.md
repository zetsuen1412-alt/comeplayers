# IGDB Catalog Operations Runbook V23.2

## Daily workflow

1. Open `/admin/games/igdb`.
2. Review the latest sync run.
3. Inspect pending candidates.
4. Confirm name, release year, platform, cover, and existing-match target.
5. Approve or reject candidates.
6. Apply approved candidates.
7. Activate relevant newly imported games from `/admin/games`.

## Match score guidance

- 100: existing `igdb_id` match.
- 70–100: strong slug/name match, often with release/platform evidence.
- 65–69: possible exact normalized-name match; review carefully.
- below 65: treated as a new game, not linked automatically.

Never approve a match solely because the title is similar. Check remakes, remasters, mobile editions, and yearly sports releases.

## Local overrides

Admin changes made through `/admin/games` mark key fields in `local_override_fields`.

Provider sync always refreshes:

- provider shadow fields;
- provider payload;
- provider checksum;
- provider timestamps.

It does not replace locally overridden live fields.

## Recovering an error candidate

1. Read `last_error` in the review queue.
2. Correct the conflict in `game_master` or reject the wrong candidate.
3. Re-stage the same offset to refresh provider payload.
4. Approve and apply again.

## Provider outage

The public marketplace remains operational from Supabase because frontend pages read `game_master`, not IGDB directly.

During an outage:

- stop staging/sync jobs;
- do not disable public game pages;
- retry after provider recovery;
- inspect `igdb_sync_runs` for failed batches.

## Credential rotation

1. Create a new Twitch client secret.
2. Update server/deployment secrets.
3. restart or redeploy the application;
4. run a small stage batch;
5. revoke the old secret.

Never place Twitch credentials in client components, browser storage, logs, or Git.
