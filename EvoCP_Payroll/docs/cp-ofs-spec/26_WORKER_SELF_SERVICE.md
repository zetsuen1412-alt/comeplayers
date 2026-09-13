# Worker Self-Service

Routes may include:
- `/my/jobs`
- `/my/schedule`
- `/my/earnings`
- `/my/payroll`
- `/my/leave`

## Worker actions
Allowed by policy:
- view own assigned jobs;
- update progress;
- record/request completion;
- request handover;
- set temporary availability;
- request leave;
- view own earning/payroll details.

## Not allowed
Worker cannot:
- arbitrarily assign a protected order to self;
- change compensation/share;
- verify own completion where separation is required;
- finance-verify;
- approve payroll;
- read another worker's financial data;
- access unrelated bank/vendor/company profit data.

## Credential access
If a job requires a game-account credential:
- worker may obtain access only while authorized by active assignment/policy;
- access is audited;
- secret itself is not stored in audit;
- access is revoked after assignment/authorization ends.

## Earnings transparency
Worker-facing earning detail should trace:
order/service -> verified completed quantity -> applicable share/policy -> earning amount -> payroll period/payment state.
