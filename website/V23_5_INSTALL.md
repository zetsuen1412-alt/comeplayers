# ComePlayers V23.5 Install

Purpose: aligns the live `profiles` table with auth, messaging, seller
application, risk, and finance code paths that read or write `full_name`.

Run after V23.4:

```sql
\i scripts/comeplayers_profiles_full_name_v23_5.sql
```

Expected final status:

```text
comeplayers_profiles_full_name_v23_5_ready
```
