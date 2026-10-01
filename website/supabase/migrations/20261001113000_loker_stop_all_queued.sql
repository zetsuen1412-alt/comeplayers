BEGIN;
CREATE OR REPLACE FUNCTION public.cp_loker_control(p_revision integer, p_action text, p_config jsonb, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w public.cp_loker_workspace;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND lower(trim(role::text)) = 'admin') THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
  END IF;
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
  UPDATE public.cp_loker_workspace
     SET config=w.config,state=w.state,generation=w.generation,revision=revision+1,updated_at=now()
   WHERE id=1 RETURNING * INTO w;
  UPDATE public.cp_loker_jobs
     SET status='cancelled',payload='{}',note='Dibatalkan oleh perubahan kampanye atau STOP.',finished_at=now()
   WHERE status IN ('queued','leased') AND (generation<>w.generation OR w.state='stopped');
  INSERT INTO public.cp_loker_audit(actor,action,revision) VALUES(p_actor,p_action,w.revision);
  RETURN to_jsonb(w);
END $$;
REVOKE ALL ON FUNCTION public.cp_loker_control(integer,text,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_loker_control(integer,text,jsonb,uuid) TO service_role;
COMMIT;
