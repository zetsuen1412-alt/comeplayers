# Supabase setup — ComePlayers Marble V66

Apply after V65:

```sql
supabase/migrations/20260720170000_marble_v66_realtime_seasons_team_cups.sql
```

## Required settings

- Enable Authentication for all competitive players. Anonymous Sign-Ins are supported.
- Realtime channels must be private.
- Disable `Allow public access` in Realtime settings.
- Use only the Project URL and publishable key in the Cocos client.

## Cron

V66 schedules `comeplayers-marble-season-rollover` only when the `pg_cron` extension is already enabled. Without Cron, the rollover still runs lazily when a user calls a competitive RPC.

Check the job after enabling Cron:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'comeplayers-marble-season-rollover';
```

Manual verification:

```sql
select private.marble_rollover_competitive_season();
```

Do not expose or grant this private function to client roles.
