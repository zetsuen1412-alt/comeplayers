# ComePlayers Messages V29 — Video, Screen Sharing, and Voice Moderation

V29 extends the existing LiveKit V28 voice channel without replacing the legacy ComePlayers livestream flow.

## Added in V29

- Camera on/off in community voice channels.
- Screen sharing on/off, including shared-tab/system audio when the browser supports it.
- Video participant grid with speaking, camera, screen-share, and microphone indicators.
- Voice dock keeps camera and screen-share controls available while moving to a text channel.
- Server-side LiveKit publishing permissions for microphone, camera, and screen share.
- Owner/Admin/Moderator server-mute and disconnect controls.
- Role hierarchy protection: moderators can only act on lower roles; community owners cannot be moderated by ordinary community staff.
- Voice moderation audit records in `chat_community_audit_logs`.

## Apply the patch

From the extracted patch folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\APPLY_MESSAGES_LIVEKIT_V29.ps1 -ProjectPath "C:\Comeplayers-new"
```

The installer creates a timestamped backup under:

```text
C:\Comeplayers-new\_patch_backups\messages-livekit-v29-<timestamp>
```

## Apply the Supabase migration

```powershell
cd C:\Comeplayers-new\website
npx supabase db push
```

Confirm the migration:

```text
20260708160000_messages_livekit_video_moderation_v29.sql
```

You can verify role permissions through Supabase SQL Editor with:

```text
website\MESSAGES_LIVEKIT_V29_VERIFY.sql
```

Expected managed-role behavior after migration:

- Owner: all permissions.
- Admin: voice, camera, screen share, and voice moderation.
- Moderator: voice, camera, screen share, and voice moderation.
- Member: voice, camera, and screen share.

## Local verification

The existing LiveKit variables remain unchanged:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
```

Then run:

```powershell
cd C:\Comeplayers-new\website
npm run typecheck
npm test
npm run dev
```

Open:

```text
http://localhost:3000/messages
```

Test with two accounts in the same community and `Lounge` channel:

1. Join voice from both accounts.
2. Toggle camera.
3. Start and stop screen sharing.
4. Confirm both participants appear in the video grid.
5. Test mute and disconnect from an Owner/Admin/Moderator account against a lower-role account.
6. Confirm the original group livestream still works separately.

Use a headset during two-account audio testing to avoid feedback.

## Deploy

No new Vercel environment variables are required beyond the three LiveKit variables already configured for V28. Deploy the updated source after the migration succeeds.

## Security behavior

- LiveKit API secret remains server-side.
- Browser tokens only receive media source grants allowed by the community role.
- Moderation requests are rechecked server-side against membership, channel type, permission, and role hierarchy.
- A server mute does not silently turn a user's microphone back on. The user controls any later unmute after rejoining or using their own control.
