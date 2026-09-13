# Supabase setup for ComePlayers Marble V57

Apply the migration in this directory to a Supabase project, enable anonymous sign-ins for guest testing, and configure the Cocos client with a publishable key only.

Migration:

```text
migrations/20260719031721_marble_v57_realtime_rooms.sql
```

The migration creates room and membership tables, RLS policies, authenticated create/join RPCs, and private Broadcast/Presence authorization on `realtime.messages`.

Live database linting is recommended after linking the Supabase CLI:

```bash
npx supabase db lint --linked --schema public,private,realtime --level warning
```

Do not run a service-role or secret key in the Cocos client.
