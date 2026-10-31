# Monitor teams: database contract

Apply `website/supabase/migrations/20261031013816_fh3_monitor_teams.sql` after the existing Monitor migrations and before deploying the updated API and Windows application. This migration is additive. Existing Payroll wages, financial Closing, Telegram delivery keys, and historical Monitor Closing rows are preserved.

The application uses one order-level TAKE / START / PAUSE / CONTINUE / DONE lifecycle. The original employee remains the reporting employee. A team is a separate allocation roster, with one to four distinct active FH3 employees. An admin enters positive percentages with at most two decimal places; integer basis points must total exactly 10,000. Existing participants cannot be removed. Employees can be added and shares changed until final DONE or Tutup Buku. Joined timestamps remain unchanged when percentages are edited. Every successful change increments the team version and the order control version and appends an audit entry.

RPCs are executable only by `service_role`, with actor authorization checked inside every mutation:

- `cp_monitor_team_snapshot(p_order_ref text)` returns `{orderRef, teamVersion, primaryEmployeeCode, participants}`. A legacy single assignment is version zero with a 100% participant; an unassigned order has an empty list. A Payroll legacy participant may have `joinedAt: null` because no trustworthy historic join timestamp exists.
- `cp_monitor_team_states(p_refs text[] default null)` returns an array of explicit team snapshots. Null requests all teams; an empty list returns none.
- `cp_monitor_set_team(p_order_ref text, p_expected_version bigint, p_participants jsonb, p_actor_user_id uuid)` updates an assigned order atomically.
- `cp_monitor_assign_team` has the same parameters. It wraps the existing assignment function and sets the team in one transaction. For a new order, the first submitted participant is the original reporting employee. Telegram TAKE delivery occurs through the existing API after this transaction, preserving its uncertain-delivery handling.

Participants contain `employeeCode` and `shareBps` in mutation requests. Responses add stable `employeeId`, `employeeName`, and `joinedAt`. Team mutations use the existing source-receipt/workspace lock order, reject stale versions, closed or inactive orders, and sending/unknown TAKE, proof, pause, or daily events. Legacy transfer is blocked for explicit teams because it resets evidence and replaces a single beneficiary. The original reporting employee and all earlier evidence are retained.

Tables `cp_fh3_monitor_teams` and `cp_fh3_monitor_team_members` store the mutable roster. RLS is enabled, direct API writes are revoked, and only the validated RPCs can mutate it. A workspace trigger preserves participant identities when the employee roster is refreshed.

`cp_fh3_monitor_closing_items` remains the immutable once-per-order seal and keeps its original total wage. New explicit-team closings also write `cp_fh3_monitor_closing_shares` in the same transaction. The API replaces the original total item with these recipient rows when presenting a book; it must not append both representations. Historical closings have no share rows and retain their original display. Every share stores the team version, original join timestamp, percentage, identity, and integer rupiah amount. Compute each base share as `floor(totalRupiah * shareBps / 10000)`, then distribute the residual one rupiah at a time in employee-code order. Shares therefore always sum to the original order wage. Global order counts count distinct order references.

Verification runs against an isolated in-memory PostgreSQL database with the actual preceding migrations, never production:

```sh
node --experimental-strip-types --test tests/monitor-team-database.test.ts
```

The test upgrades an existing immutable closing; checks authorization, percentage validation, the four-person limit, stale versions, removal rejection, atomic assignment rollback, join preservation, post-START and paused additions, daily order continuity, Telegram ambiguity guards, unchanged job/proof records, exact allocation rounding and closing replay; verifies public grants and unchanged Payroll data.
