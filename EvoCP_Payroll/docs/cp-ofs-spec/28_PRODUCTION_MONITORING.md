# Production Monitoring & Observability

## Health
Monitor:
- application;
- database;
- background/outbox queue;
- failed/dead-letter jobs;
- AI auditor availability;
- backup status;
- financial integrity indicators;
- current deployment/schema version.

## Financial integrity metrics
Expected normal values include zero for:
- unbalanced posted journal;
- payment overmatch;
- duplicate source-event earnings;
- impossible negative stock under disallow-negative policy;
- payroll without source lineage for mandatory components.

## Structured logs
Include:
- request_id;
- organization_id where safe;
- action;
- entity type/ID;
- result/error code;
- duration.

Never log secrets or full sensitive payloads unnecessarily.

## Correlation
A business action should carry the same request/correlation ID through transport, domain action, audit, outbox, and error monitoring.

## Background jobs
Track pending count, oldest pending age, attempt count, failures, dead letters.

A stuck earning/reconciliation job must not remain invisible.

## Performance
Monitor:
- order/search queries;
- dashboards;
- payroll calculation;
- closing checks;
- bank import;
- inventory valuation.

Investigate query plans/indexes before reflexively increasing infrastructure.

## Deployment observability
Record:
- deployment ID;
- commit SHA;
- migration/schema version;
- deployment time.

Correlate error-rate changes with deployments.

## Alerts
Severity must be meaningful:
INFO, WARNING, HIGH, CRITICAL/P0.

Deduplicate repeated alerts into one evolving event/incident when appropriate.
