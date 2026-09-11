# ComePlayers Arcade V44.1 — Monopoly visibility fix

This patch keeps CP Monopoly and CP Chess pinned in a non-scrolling **Featured Strategy** section at the top of the Arcade sidebar.

## Install

Extract this ZIP into the Comeplayers-new project root and allow file replacement.

Then run:

```powershell
cd C:\Comeplayers-new\website
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm run dev
```

No Supabase migration is required for this UI-only fix.
