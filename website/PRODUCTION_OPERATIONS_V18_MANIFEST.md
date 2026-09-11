# ComePlayers V18 Manifest

## New files

- `app/admin/reconciliation/page.tsx`
- `app/api/admin/reconciliation/route.ts`
- `app/api/cron/reconcile-finance/route.ts`
- `lib/observability.ts`
- `lib/reconciliation.ts`
- `lib/reconciliationServer.ts`
- `scripts/comeplayers_production_operations_v18.sql`
- `tests/observability.test.ts`
- `tests/reconciliation.test.ts`
- `PRODUCTION_OPERATIONS_V18_INSTALL.md`
- `PRODUCTION_OPERATIONS_V18_MANIFEST.md`
- `PRODUCTION_OPERATIONS_V18_VERIFY.sql`
- `PRODUCTION_RUNBOOK_V18.md`
- `V18_INSTALL.md`

## Modified files

- `.github/workflows/ci.yml`
- `app/admin/finance/page.tsx`
- `app/admin/page.tsx`
- `app/api/paypal/webhook/route.ts`
- `package.json`
- `PROJECT_STATUS.md`
- `README.md`
- `vercel.json`

## Database changes

- `reconciliation_runs`
- `reconciliation_issues`
- RLS policies for authenticated admins
- mutation grants restricted to the service role

## No changes

- no payment provider mode change
- no required new environment variable
- no automatic financial correction
- no destructive migration
