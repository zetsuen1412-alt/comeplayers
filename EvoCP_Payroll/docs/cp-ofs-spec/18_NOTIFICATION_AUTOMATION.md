# Notification & Automation Engine

## Principle
Business modules emit structured events. They do not directly hard-code email/push delivery logic.

## Core entities
- notification_rules
- notification_events
- notification_deliveries

## Example events
- ORDER_UNASSIGNED
- ORDER_AT_RISK
- ORDER_OVERDUE
- WORKER_OVERLOADED
- FINANCE_CRITICAL_ISSUE
- PAYMENT_UNMATCHED
- PAYROLL_READY
- APPROVAL_REQUIRED
- CLOSING_READY
- BACKUP_FAILED
- BACKGROUND_JOB_FAILED

## Recipient policy
Recipients are role/ownership/team-aware. Examples:
- order operational alert -> supervisor;
- payroll ready -> Finance Admin;
- large material approval -> configured approver/Owner;
- new job -> assigned worker.

Do not broadcast every alert to Owner.

## Dedupe
Use stable event/fingerprint and a suppression window. Repeated scans of the same unresolved problem must not create notification spam.

## Escalation
Rules may escalate by elapsed time/severity. Example:
unassigned urgent order -> supervisor -> operations admin -> owner.

## Quiet behavior
Worker leave/offline state may suppress ordinary assignment reminders, but critical policy events may bypass quiet behavior.

## Scheduled reports
Deterministic scheduled summaries can use the same delivery engine:
- Daily Owner Brief
- Weekly Operations Brief
- Payroll Ready Report
- Closing Report

AI is not required to generate the underlying facts.

## Safety
Notifications are asynchronous. Notification failure must not roll back a committed financial business action.
