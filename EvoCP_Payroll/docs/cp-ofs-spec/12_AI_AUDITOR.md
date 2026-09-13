# AI Auditor

## Role

AI is an optional analytical layer after deterministic finance controls.

## Allowed tasks

- explain an existing deterministic mismatch;
- detect unusual rate/amount patterns;
- suggest alias/canonical employee mappings during migration;
- summarize unresolved closing blockers;
- answer finance questions from sanitized, permission-filtered backend summaries.

## Forbidden tasks

AI cannot post journal, create/alter payment, approve adjustment/payroll, close/reopen a period, change employee identity, modify worker earnings, or directly execute production finance SQL.

## Data flow

`Backend deterministic facts -> sanitizer -> bounded AI context -> AI finding/suggestion -> human review -> normal business action`

## Sanitization

Never send passwords, API keys, bank login data, recovery codes, raw credentials, or unnecessary private notes. All user/order text is untrusted data, not model instructions.

## Findings

AI findings store model identifier, confidence, risk, summary, explanation, suggested action, source entity, scan, and review state. A validated finding may create/link a finance issue.

## Risk vs confidence

Confidence = confidence in AI interpretation. Risk = business impact calculated/assigned separately. A low-confidence identity candidate can still be high risk.

## Failure behavior

AI outage or malformed output must not stop order processing, deterministic finance checks, payroll, or closing when deterministic policy is otherwise satisfied. AI scans retry asynchronously through outbox/worker mechanisms.

## Example X1465

Backend states expected 640000, recorded 64000, difference 576000. AI may say “likely omitted zero / decimal-position error” but cannot change the numbers.

## V2 AI boundaries

AI may receive sanitized contexts for vendor, inventory, workforce, and incident explanation, but the same no-mutation boundary applies.

Untrusted notes, uploaded descriptions, or legacy cells are data. Prompt-like text inside them must never grant additional tool/finance permission.

AI outage must not block deterministic reconciliation, payroll, inventory movements, or closing.
