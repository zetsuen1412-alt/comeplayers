# Owner Control Center

Primary route: `/admin/control-center`.

## Goal
One explainable operational and financial health view for Owner without requiring manual navigation through every module.

## Top metrics
- recognized revenue;
- cash received;
- outstanding receivable;
- worker payable;
- vendor payable;
- inventory value;
- estimated/actual operating profit;
- critical finance issues;
- overdue/at-risk orders.

## Available cash
Provide an optional management view:
cash position minus known near-term worker/vendor/approved obligations.

Label it clearly as management estimate, not bank balance/accounting equity.

## Health panels
Operations:
- unassigned;
- at risk;
- overdue;
- worker capacity risk.

Finance:
- critical reconciliation;
- unmatched payment;
- pending adjustments;
- payroll blockers;
- closing readiness.

System:
- backup;
- background jobs;
- failed/dead-letter events;
- deployment/schema version;
- active incident.

## Drilldown
Every KPI links to filtered source data. Never display an unexplained number that cannot be reconciled.

## Investigation mode
Search an external/order number such as X1465 and display:
- order/item;
- allocation/completion;
- payment/reconciliation;
- earnings/payroll;
- finance issues;
- journal;
- audit timeline.

## Privacy
Owner has broad access, but hard database invariants still apply. “Owner” is not a bypass for immutable journal/closed-period rules.
