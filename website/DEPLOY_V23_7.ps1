$ErrorActionPreference = "Stop"

Write-Host "ComePlayers V23.7 validation and production deployment" -ForegroundColor Cyan
Write-Host "Apply scripts/comeplayers_bulk_import_history_v23_7.sql in Supabase before continuing." -ForegroundColor Yellow

npm install
npm run typecheck
npm run typecheck:e2e
npx eslint app/api/seller/catalog/bulk/route.ts app/seller/products/import/page.tsx lib/bulkListingSpreadsheet.ts tests/bulkListingSpreadsheet.test.ts
npm test
npx vercel --prod

Write-Host "Deployment command completed. Verify /seller/products/import on the production domain." -ForegroundColor Green
