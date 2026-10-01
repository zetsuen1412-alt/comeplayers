-- Additive and isolated: no employee, applicant, payroll or login schema changes.
BEGIN;
CREATE TABLE public.cp_loker_workspace (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  revision integer NOT NULL DEFAULT 0,
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','running','paused','stopped')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cp_loker_workspace (id) VALUES (1);
CREATE TABLE public.cp_loker_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mime text NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp')),
  body text NOT NULL CHECK (length(body) <= 2796204), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cp_loker_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE,
  generation uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('page_post','group_post','group_scan','group_comment','page_comment','messenger')),
  channel text NOT NULL CHECK (channel IN ('browser','meta')), target text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','leased','sending','sent','pending','skipped','failed','uncertain','cancelled')),
  lease uuid, leased_at timestamptz, started_at timestamptz, finished_at timestamptz,
  external_ref text, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cp_loker_jobs_queue ON public.cp_loker_jobs(channel, status, created_at);
CREATE INDEX cp_loker_jobs_published ON public.cp_loker_jobs(external_ref) WHERE kind = 'page_post';
CREATE TABLE public.cp_loker_suppression (
  subject text PRIMARY KEY CHECK (length(subject) = 64), expires_at timestamptz,
  reason text NOT NULL CHECK (reason IN ('optout','human')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cp_loker_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor uuid NOT NULL, action text NOT NULL,
  revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cp_loker_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cp_loker_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cp_loker_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cp_loker_suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cp_loker_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cp_loker_workspace, public.cp_loker_jobs, public.cp_loker_banners, public.cp_loker_suppression, public.cp_loker_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cp_loker_workspace, public.cp_loker_jobs, public.cp_loker_banners, public.cp_loker_suppression, public.cp_loker_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cp_loker_audit_id_seq TO service_role;

CREATE FUNCTION public.cp_loker_control(p_revision integer, p_action text, p_config jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.cp_loker_workspace;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND lower(trim(role::text)) = 'admin') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM public.cp_loker_workspace WHERE id = 1 FOR UPDATE;
  IF w.revision <> p_revision THEN RAISE EXCEPTION 'Revision conflict' USING ERRCODE = '40001'; END IF;
  IF p_action = 'save' THEN
    IF w.state = 'running' THEN RAISE EXCEPTION 'Pause before editing' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_config) <> 'object' OR octet_length(p_config::text) > 100000 THEN RAISE EXCEPTION 'Invalid config' USING ERRCODE = '22023'; END IF;
    IF w.config <> p_config THEN w.generation := gen_random_uuid(); END IF;
    w.config := p_config; w.state := 'draft';
  ELSIF p_action = 'start' THEN w.state := 'running';
  ELSIF p_action = 'pause' THEN w.state := 'paused';
  ELSIF p_action = 'stop' THEN w.state := 'stopped';
  ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE = '22023'; END IF;
  UPDATE public.cp_loker_workspace SET config = w.config, state = w.state, generation = w.generation,
    revision = revision + 1, updated_at = now() WHERE id = 1 RETURNING * INTO w;
  -- Leased tasks have not dispatched; STOP cancels them. Already-dispatched requests may finish.
  UPDATE public.cp_loker_jobs SET status = 'cancelled', payload = '{}', note = 'Dibatalkan oleh perubahan kampanye.', finished_at = now()
    WHERE status IN ('queued','leased') AND (generation <> w.generation OR (w.state = 'stopped' AND kind IN ('messenger','page_comment')));
  INSERT INTO public.cp_loker_audit(actor, action, revision) VALUES(p_actor, p_action, w.revision);
  RETURN to_jsonb(w);
END $$;

CREATE FUNCTION public.cp_loker_claim(p_channel text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.cp_loker_workspace; j public.cp_loker_jobs; stale integer;
BEGIN
  SELECT * INTO w FROM public.cp_loker_workspace WHERE id = 1 FOR UPDATE;
  -- Never automatically retry a send after a crashed worker or lost acknowledgement.
  UPDATE public.cp_loker_jobs SET status = 'uncertain', note = 'Worker terputus. Periksa Facebook; tidak dikirim ulang.', payload = '{}', finished_at = now()
    WHERE status IN ('leased','sending') AND leased_at < now() - interval '3 minutes';
  GET DIAGNOSTICS stale = ROW_COUNT;
  IF stale > 0 THEN
    IF w.state = 'running' THEN UPDATE public.cp_loker_workspace SET state = 'paused', revision = revision + 1, updated_at = now() WHERE id = 1; END IF;
    RETURN NULL;
  END IF;
  IF w.state <> 'running' OR EXISTS (SELECT 1 FROM public.cp_loker_jobs WHERE status IN ('leased','sending')) THEN RETURN NULL; END IF;
  SELECT * INTO j FROM public.cp_loker_jobs WHERE channel = p_channel AND status = 'queued' AND generation = w.generation
    AND (kind = 'group_scan' OR (SELECT count(*) FROM public.cp_loker_jobs WHERE kind <> 'group_scan' AND started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') < coalesce((w.config->>'dailyLimit')::integer,10))
    ORDER BY CASE WHEN kind IN ('messenger','page_comment') THEN 0 WHEN kind = 'group_scan' THEN 2 ELSE 1 END, created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF j.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cp_loker_jobs SET status = 'leased', lease = gen_random_uuid(), leased_at = now() WHERE id = j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.cp_loker_preflight(p_id uuid, p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.cp_loker_workspace; j public.cp_loker_jobs;
BEGIN
  SELECT * INTO w FROM public.cp_loker_workspace WHERE id = 1 FOR UPDATE;
  SELECT * INTO j FROM public.cp_loker_jobs WHERE id = p_id FOR UPDATE;
  IF w.state <> 'running' OR j.generation <> w.generation OR j.status <> 'leased' OR j.lease IS DISTINCT FROM p_lease OR j.leased_at < now() - interval '150 seconds' THEN RETURN false; END IF;
  IF j.kind <> 'group_scan' AND (SELECT count(*) FROM public.cp_loker_jobs WHERE kind <> 'group_scan' AND started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') >= coalesce((w.config->>'dailyLimit')::integer,10) THEN RETURN false; END IF;
  UPDATE public.cp_loker_jobs SET status = 'sending', started_at = now() WHERE id = j.id;
  RETURN true;
END $$;

CREATE FUNCTION public.cp_loker_finish(p_id uuid, p_lease uuid, p_status text, p_ref text, p_note text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.cp_loker_workspace; j public.cp_loker_jobs;
BEGIN
  SELECT * INTO w FROM public.cp_loker_workspace WHERE id = 1 FOR UPDATE;
  SELECT * INTO j FROM public.cp_loker_jobs WHERE id = p_id FOR UPDATE;
  IF j.lease IS DISTINCT FROM p_lease THEN RETURN false; END IF;
  IF j.status NOT IN ('leased','sending') THEN RETURN j.status = p_status; END IF;
  IF p_status NOT IN ('sent','pending','skipped','failed','uncertain','cancelled') THEN RAISE EXCEPTION 'Invalid result'; END IF;
  IF p_status IN ('sent','pending') AND j.status <> 'sending' THEN RAISE EXCEPTION 'No dispatch'; END IF;
  UPDATE public.cp_loker_jobs SET status = p_status, external_ref = left(p_ref,500), note = left(coalesce(p_note,''),250),
    payload = '{}', finished_at = now() WHERE id = j.id;
  IF p_status IN ('uncertain','failed') AND w.state = 'running' THEN
    UPDATE public.cp_loker_workspace SET state = 'paused', revision = revision + 1, updated_at = now() WHERE id = 1;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cp_loker_control(integer,text,jsonb,uuid), public.cp_loker_claim(text), public.cp_loker_preflight(uuid,uuid), public.cp_loker_finish(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_loker_control(integer,text,jsonb,uuid), public.cp_loker_claim(text), public.cp_loker_preflight(uuid,uuid), public.cp_loker_finish(uuid,uuid,text,text,text) TO service_role;
COMMIT;
