# Migrasi 27.0 → 28.0

Tidak ada perubahan aturan game. 28.0 mengganti lapisan client.

- Backend: tetap Supabase project ComePlayers / namespace `crwt_*`.
- Win condition: bankruptcy / Last Player Standing.
- 1–8 pemain: tetap dari backend room.
- Ranked: tetap server-side dan normalized.
- Rematch: tetap RPC v27.

### Arsitektur client
`CRWT_Bootstrap -> CRWT_Login -> CRWT_Lobby -> CRWT_Match`

`CrwtSupabaseClient` berbicara langsung ke Auth/REST RPC Supabase menggunakan publishable key dan access token user. Tidak ada `service_role` di client.
