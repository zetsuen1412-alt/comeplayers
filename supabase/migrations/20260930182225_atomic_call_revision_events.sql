-- Minimal, account-scoped call invalidation. cp_calls stays service-only and is
-- not added to Realtime. The existing published table carries no call payload.
-- Only the existing server role gains schema name resolution. This grants no
-- function EXECUTE or table privileges, and changes no browser role privileges.
GRANT USAGE ON SCHEMA cp_live_private TO service_role;

ALTER TABLE public.cp_live_revisions
  DROP CONSTRAINT cp_live_revisions_scope_check;
ALTER TABLE public.cp_live_revisions
  ADD CONSTRAINT cp_live_revisions_scope_check CHECK (
    scope IN ('catalog', 'admin', 'payroll')
    OR scope ~ '^(user|calls):[0-9a-f-]{36}$'
  );

-- The existing policies remain unchanged. This additional policy grants only
-- the caller's own new scope; admin/payroll/catalog permissions are unaffected.
CREATE POLICY live_calls_own_read ON public.cp_live_revisions
  FOR SELECT TO authenticated
  USING (scope = 'calls:' || (SELECT auth.uid())::text);

CREATE FUNCTION cp_live_private.notify_call_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  participants uuid[] := '{}'::uuid[];
  target text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.caller_id, OLD.callee_id, OLD.room_id, OLD.media, OLD.status, OLD.created_at,
           OLD.scheduled_at, OLD.answered_at, OLD.ended_at)
       IS NOT DISTINCT FROM
       ROW(NEW.caller_id, NEW.callee_id, NEW.room_id, NEW.media, NEW.status, NEW.created_at,
           NEW.scheduled_at, NEW.answered_at, NEW.ended_at) THEN
      RETURN NULL;
    END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    participants := participants || ARRAY[OLD.caller_id, OLD.callee_id];
  END IF;
  IF TG_OP <> 'DELETE' THEN
    participants := participants || ARRAY[NEW.caller_id, NEW.callee_id];
  END IF;

  -- Lock participants in a stable order even when opposite-direction calls or
  -- reassignment/deletion occur. Every revision is in the call transaction.
  FOR target IN
    SELECT DISTINCT 'calls:' || participant::text
    FROM unnest(participants) AS p(participant)
    WHERE participant IS NOT NULL
    ORDER BY 1
  LOOP
    INSERT INTO public.cp_live_revisions(scope, revision, changed_at)
      VALUES (target, 1, clock_timestamp())
    ON CONFLICT (scope) DO UPDATE
      SET revision = cp_live_revisions.revision + 1,
          changed_at = EXCLUDED.changed_at;
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION cp_live_private.notify_call_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER cp_notify_call_revision
  AFTER INSERT OR UPDATE OR DELETE ON public.cp_calls
  FOR EACH ROW EXECUTE FUNCTION cp_live_private.notify_call_change();

-- Activation is deliberately separate: CALL_REVISION_EVENTS_ENABLED remains
-- false until trigger, own-account RLS and existing publication are verified.
-- For rollback, disable that flag first; this additive trigger can stay installed.
