# Operations SLA, Progress & ETA

## SLA
Services may define target completion duration. Order/item due dates may override.

Operational health:
- ON_TRACK
- AT_RISK
- LIKELY_LATE
- OVERDUE
- ON_HOLD

These are derived read states, not arbitrary manual statuses.

## Progress
Use append-oriented `job_progress_events`. Keep current summary as derived/cache if needed.

Progress may be:
- quantity;
- level;
- percent;
- service-specific metadata.

## SLA pause
Job pauses have reason and `stops_sla` policy. Server/game maintenance or customer unavailability may pause SLA when policy says so.

## Deadline change
Never silently overwrite due date history for analytical purposes. Record deadline-change/status event with old/new/reason/actor.

## ETA
Initial ETA is deterministic from remaining quantity and observed/configured velocity when enough data exists. It is an estimate, not a promise.

## At-risk logic
Example deterministic inputs:
- elapsed SLA ratio;
- progress ratio;
- remaining work;
- worker capacity;
- dependency/blocker state.

## Escalation
At-risk/overdue events feed notification rules. High-priority orders may escalate faster.

## Performance fairness
On-time metrics should exclude approved SLA-paused intervals and use the active/confirmed deadline version.
