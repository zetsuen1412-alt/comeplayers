BEGIN;

CREATE OR REPLACE FUNCTION public.cp_loker_claim(p_channel text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.cp_loker_workspace; j public.cp_loker_jobs; stale integer;
BEGIN
  SELECT * INTO w FROM public.cp_loker_workspace WHERE id = 1 FOR UPDATE;

  UPDATE public.cp_loker_jobs
     SET status = 'uncertain',
         note = 'Worker terputus. Periksa Facebook; tidak dikirim ulang.',
         payload = '{}',
         finished_at = now()
   WHERE status IN ('leased','sending')
     AND leased_at < now() - interval '3 minutes';
  GET DIAGNOSTICS stale = ROW_COUNT;

  IF stale > 0 THEN
    IF w.state = 'running' THEN
      UPDATE public.cp_loker_workspace
         SET state = 'paused', revision = revision + 1, updated_at = now()
       WHERE id = 1;
    END IF;
    RETURN NULL;
  END IF;

  IF w.state <> 'running'
     OR EXISTS (SELECT 1 FROM public.cp_loker_jobs WHERE status IN ('leased','sending'))
  THEN
    RETURN NULL;
  END IF;

  SELECT * INTO j
    FROM public.cp_loker_jobs
   WHERE channel = p_channel
     AND status = 'queued'
     AND generation = w.generation
     AND (
       kind IN ('group_scan','group_comment')
       OR (
         SELECT count(*)
           FROM public.cp_loker_jobs
          WHERE kind NOT IN ('group_scan','group_comment')
            AND started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
       ) < coalesce((w.config->>'dailyLimit')::integer, 10)
     )
   ORDER BY CASE
     WHEN kind IN ('messenger','page_comment') THEN 0
     WHEN kind = 'group_comment' THEN 1
     WHEN kind = 'group_scan' THEN 3
     ELSE 2
   END, created_at, id
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF j.id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.cp_loker_jobs
     SET status = 'leased', lease = gen_random_uuid(), leased_at = now()
   WHERE id = j.id
   RETURNING * INTO j;

  RETURN to_jsonb(j);
END $$;

CREATE OR REPLACE FUNCTION public.cp_loker_preflight(p_id uuid, p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.cp_loker_workspace; j public.cp_loker_jobs;
BEGIN
  SELECT * INTO w FROM public.cp_loker_workspace WHERE id = 1 FOR UPDATE;
  SELECT * INTO j FROM public.cp_loker_jobs WHERE id = p_id FOR UPDATE;

  IF w.state <> 'running'
     OR j.generation <> w.generation
     OR j.status <> 'leased'
     OR j.lease IS DISTINCT FROM p_lease
     OR j.leased_at < now() - interval '150 seconds'
  THEN
    RETURN false;
  END IF;

  IF j.kind NOT IN ('group_scan','group_comment')
     AND (
       SELECT count(*)
         FROM public.cp_loker_jobs
        WHERE kind NOT IN ('group_scan','group_comment')
          AND started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
     ) >= coalesce((w.config->>'dailyLimit')::integer, 10)
  THEN
    RETURN false;
  END IF;

  UPDATE public.cp_loker_jobs
     SET status = 'sending', started_at = now()
   WHERE id = j.id;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.cp_loker_claim(text), public.cp_loker_preflight(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_loker_claim(text), public.cp_loker_preflight(uuid,uuid)
  TO service_role;

COMMIT;
