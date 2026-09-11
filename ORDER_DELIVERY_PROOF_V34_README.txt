ComePlayers Order Delivery Proof V34

Fixes:
- Deliver Product now works when the required screenshot + video proof is present even if the optional delivery note / credentials fields are empty.
- Server creates a safe default delivery note when seller leaves the text fields empty.
- Seller-side API errors and success messages are shown directly above the Deliver Product button.
- Mandatory rule remains: at least 1 screenshot + 1 video.
- No count limit for screenshots or videos.
- Existing R2 proof validation and encrypted delivery storage remain enabled.

Replace this archive at C:\Comeplayers-new and choose Replace All.
Then run from C:\Comeplayers-new\website:
  npm run typecheck
  npm run build
  npx vercel@latest --prod --force
