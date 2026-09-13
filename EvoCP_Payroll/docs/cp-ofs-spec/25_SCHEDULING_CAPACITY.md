# Scheduling & Capacity

## Schedules
Support:
- fixed;
- rotating/shift;
- flexible;
- date-specific override.

Do not force office-style shift rules on all workers.

## Leave
Leave lifecycle:
`requested -> approved -> active -> completed`
or rejected/cancelled.

Approved leave removes worker from ordinary assignment suggestions during the relevant window.

## Capacity
Capacity may use:
- work units/day;
- estimated minutes;
- service-specific adjustments.

A worker may have a profile and effective-date changes.

## Capacity warning
Assignments can produce:
- normal;
- high utilization;
- overloaded.

Hard limits may block; policy-permitted override requires reason/audit.

## Concurrency
Capacity must be rechecked inside transaction/lock-sensitive assignment logic so two supervisors cannot both consume the same final capacity slot.

## Forecast
Aggregate scheduled skilled capacity against existing workload and forecast demand by game/service. Forecast is planning information, not payroll.

## Skill capacity risk
Detect game/service demand with insufficient qualified worker capacity and expose as operational planning issue.
