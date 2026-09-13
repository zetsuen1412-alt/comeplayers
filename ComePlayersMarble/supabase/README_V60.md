# ComePlayers Marble V60 — Authoritative Special Tiles

Apply `20260719074500_marble_v60_authoritative_special_tiles.sql` after the V57, V58, and V59 migrations.

The migration adds:

- server Fortune cards;
- server Game Center selection and draw;
- server Olympic city selection, multiplier, and expiration;
- server World Travel credits, cost, destination, and follow-up action;
- server Island detention and skipped turns;
- rent-shield consumption inside authoritative payment;
- special result, choice options, and new event kinds in snapshots;
- replacement authenticated RPC wrappers with old V59 entry points revoked.

Use only the Supabase Project URL and publishable key in the Cocos client. Never ship a service-role or secret key. Keep Realtime channels private, keep RLS enabled on exposed tables, and test players with separate authenticated/anonymous sessions.
