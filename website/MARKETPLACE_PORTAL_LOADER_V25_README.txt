COMEPLAYERS MARKETPLACE PORTAL LOADER V25

This replace package adds a dedicated App Router loading screen for /marketplace.

Behavior:
- Uses Next.js app/marketplace/loading.tsx.
- Shows the Alexia "Portal to Marketplace" loading screen while the /marketplace route is loading.
- Includes animated progress, status checkpoints, and a full-screen visual matching the approved design.

Install:
1. Extract the ZIP.
2. Copy the Comeplayers-new folder into your project root.
3. Choose Replace All.

Notes:
- This package does not overwrite your marketplace page.tsx.
- The loader appears automatically through Next.js route loading UI.
- If you want the loader to stay longer, add a small async delay to your marketplace page/server data loading.
