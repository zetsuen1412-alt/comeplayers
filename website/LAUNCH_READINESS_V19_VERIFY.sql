SELECT to_regclass('public.operational_alerts') AS operational_alerts;
SELECT to_regclass('public.operational_runs') AS operational_runs;
SELECT to_regclass('public.payment_webhook_events') AS payment_webhook_events;
SELECT to_regclass('public.launch_signoffs') AS launch_signoffs;

SELECT area, status, signed_at
FROM public.launch_signoffs
ORDER BY area;

SELECT status, count(*)
FROM public.operational_alerts
GROUP BY status
ORDER BY status;

SELECT processing_status, count(*)
FROM public.payment_webhook_events
GROUP BY processing_status
ORDER BY processing_status;
