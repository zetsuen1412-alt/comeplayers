# Reporting & Analytics

## Purpose
Provide explainable management analytics without creating a second accounting truth.

## Reporting layers
1. Transactional source tables.
2. Database views/read models.
3. Materialized/summary tables only when performance requires them.

Frontend should not recompute company totals by combining unrelated client-side API calls.

## Financial metrics
Every metric must have a version-controlled definition and drilldown.

Core:
- Gross Revenue
- Refunds
- Net Revenue
- Worker/Service Cost
- Vendor Cost
- Inventory COGS
- Payment Fees
- Contribution/Gross Profit
- Operating Expenses
- Operating Profit
- Cash Received
- Accounts Receivable
- Worker Payable
- Vendor Payable
- Inventory Value

## Revenue versus cash
Recognized revenue and cash movement are separate. Reports must never label bank inflow as revenue without business context.

## Period labels
- `PRELIMINARY`: live/open-period data.
- `FINAL`: closed-period snapshot.
- `ESTIMATED`: forecast/projection.

## Profitability dimensions
Support drilldown by:
- game;
- service;
- source/channel;
- FH/team;
- worker;
- vendor;
- order;
- fulfillment source.

Do not expose sensitive profit/cost dimensions to roles lacking permission.

## Aging
Accounts receivable and vendor payable aging:
- not due;
- 1–3 days;
- 4–7 days;
- 8–14 days;
- >14 days;
with drilldown to source obligations.

## Trend comparisons
Today/yesterday, week/week, month/month. For incomplete periods use fair comparable ranges and label preliminary.

## Forecast
Initial forecast may use deterministic run-rate logic. Always label as estimate. AI/statistical forecasting is optional and non-authoritative.

## Saved reports
Users with permission may save filter definitions. Saved reports store filters/metric IDs, not arbitrary executable SQL.

## Export
Separate permissions:
- orders.export
- finance.export
- payroll.export
- audit.export
- inventory.export

Sensitive exports are audited.

## Data quality
Expose operational data-quality ratios such as:
- payment reconciliation rate;
- employee mapping completeness;
- unresolved critical issue count;
- inventory reconciliation completeness.

A data-quality score must be deterministic and decomposable.
