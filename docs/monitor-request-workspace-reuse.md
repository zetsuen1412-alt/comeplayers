# Reduce repeated Monitor workspace reads

In one sampled 15-minute incident window, Postgres logs contained 70 timed-out
reads of cp_payroll_workspace, plus Auth gateway timeouts. Direct management SQL
connections also timed out. This identifies pressure/failures around workspace
access; it does not establish CPU saturation or the complete outage cause.

For non-admin Monitor accounts, authorization already loads the workspace to
validate current employee bindings. Roster, pending and tasks then loaded the
same payload again. Return that server-only snapshot to the calling handler and
reuse it within the same request, reducing two full workspace reads to one.
Admin requests still load the workspace once in the handler.

There is no global cache, cross-request reuse, permission bypass, schema change
or data write. Identity/MFA, stored role, active binding, roster eligibility,
session state, Telegram sender/source and output privacy checks remain intact.
Every new request still reloads its current authorization data.

Validation: 24 targeted API/authorization/roster tests, TypeScript and targeted
ESLint pass. Regression coverage rejects a second workspace query in all three
handlers and verifies account revocation and per-request identity checks.

Production approval and post-deployment verification are required. This is a
load-reduction mitigation, not a claim that the database incident is resolved.
