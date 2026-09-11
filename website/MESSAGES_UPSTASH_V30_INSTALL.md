# ComePlayers Messages V30 — Upstash Redis

V30 adds temporary realtime infrastructure without moving permanent chat data away from Supabase.

## Added

- Online/offline presence heartbeat with a 70-second TTL.
- Presence list scoped to active room members.
- Typing state stored for five seconds as a fallback to Supabase Realtime broadcast.
- Redis-backed 20 messages/minute rate limit with the existing Supabase query as fallback.
- Short unread-count cache with invalidation after send and read operations.
- Safe degradation: chat, Supabase Realtime, and read receipts continue when Redis is unavailable.

Permanent messages, membership, channels, roles, and read states remain in Supabase PostgreSQL.

## Configure Upstash

Create an Upstash Redis database, then copy the REST URL and Standard REST token from its Connect/REST section.

Add to `website/.env.local`:

```env
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-standard-rest-token
```

Add the same two server-only variables to Vercel Project Settings → Environment Variables for Production, Preview, and Development, then redeploy.

Never use `NEXT_PUBLIC_` for the token.

## Install patch

```powershell
powershell -ExecutionPolicy Bypass -File .\APPLY_MESSAGES_UPSTASH_V30.ps1 -ProjectPath "C:\Comeplayers-new"
```

No Supabase migration is required for V30.

## Verify

```powershell
cd C:\Comeplayers-new\website
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Open two accounts in the same group. The member list should show online indicators and typing should appear across tabs. Sending over 20 messages in one minute should return a rate-limit warning.
