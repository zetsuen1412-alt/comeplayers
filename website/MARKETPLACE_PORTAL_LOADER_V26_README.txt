COMEPLAYERS MARKETPLACE PORTAL LOADER V26

Purpose
- The Marketplace page stays hidden until the loading progress reaches 100%.
- The Marketplace content appears only after the final 100% state is shown.

How it works
- app/marketplace/loading.tsx displays the loader while Next.js is fetching the Marketplace route.
- app/marketplace/layout.tsx wraps the existing Marketplace page with MarketplaceEntryGate.
- The route loader saves its progress in sessionStorage and stops at a maximum of 92%.
- When the Marketplace layout is ready, MarketplaceEntryGate continues from the stored value to 100%.
- After a short 100% confirmation, the Marketplace page fades in.
- Internal Marketplace navigation does not replay the loader because the marketplace layout remains mounted.
- Leaving Marketplace and opening it again replays the loader.

Install
1. Extract the ZIP.
2. Copy the Comeplayers-new folder into the project root.
3. Choose Replace All.
4. Restart npm run dev.

This package does not replace app/marketplace/page.tsx or your Marketplace components.
