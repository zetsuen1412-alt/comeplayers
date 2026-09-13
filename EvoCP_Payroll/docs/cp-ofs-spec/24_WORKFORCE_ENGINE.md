# Workforce Engine

## Separation of concepts
Employment status and operational availability are separate.

Employment:
- active
- inactive
- terminated

Availability:
- available
- busy
- break
- offline
- leave
- sick
- training

Browser presence is not the source of availability.

## Skills
Employee skills may be game/service scoped:
- trainee
- basic
- intermediate
- advanced
- expert

Skills affect assignment eligibility/recommendation, not compensation unless a separate compensation policy says so.

## Restrictions
Support temporary/permanent restrictions by game/service/high-risk account handling. Assignment engine must enforce hard restrictions.

## Workload
Use active jobs, remaining work units, estimated time, and SLA pressure. Avoid reducing workload to job count only.

## Assignment suggestion
Read-only ranking may consider:
- skill fit;
- availability;
- current workload;
- historical SLA/quality;
- team preference.

Human chooses in V1. Auto-assignment is later and must be policy-scoped.

## Handover
Handover preserves original allocation/completion/earnings and creates new allocation for remaining quantity. Never rewrite historical worker ownership.

## Emergency reassignment
Bulk preview can suggest replacements for affected jobs. Review before apply; each underlying change remains auditable.

## Privacy
Focus on output, verified quality, deadline, and capacity. CP-OFS does not require surveillance such as keylogging or screen recording.
