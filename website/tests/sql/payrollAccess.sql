\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'payroll_test' THEN RAISE EXCEPTION 'Fixture database only'; END IF; END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
-- Roles are cluster-wide: earlier isolated suites may already have created this
-- role without Supabase's BYPASSRLS attribute. Match the real service role here.
ALTER ROLE service_role BYPASSRLS;
CREATE TABLE public.profiles(id uuid primary key,role text,username text,full_name text,email text);
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT,UPDATE ON public.profiles TO service_role;
INSERT INTO public.profiles VALUES
 ('00000000-0000-4000-8000-000000000001','admin','Admin',null,'admin@example.test'),
 ('00000000-0000-4000-8000-000000000002','buyer','Operator',null,'operator@example.test'),
 ('00000000-0000-4000-8000-000000000003',null,'No role',null,'null@example.test');
\ir ../../supabase/migrations/20260913234226_payroll_final_workspace.sql
\ir ../../supabase/migrations/20260917034322_payroll_delegated_access_audit.sql
SET ROLE service_role;
DO $$ DECLARE a uuid='00000000-0000-4000-8000-000000000001'; u uuid='00000000-0000-4000-8000-000000000002'; n uuid='00000000-0000-4000-8000-000000000003'; saved jsonb;
BEGIN
  BEGIN PERFORM public.cp_save_payroll_workspace(0,'{}',u,'save'); RAISE EXCEPTION 'Uninvited user authorized'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.cp_set_payroll_access(u,u,true); RAISE EXCEPTION 'Self grant authorized'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.cp_set_payroll_access(n,u,true); RAISE EXCEPTION 'Null role authorized'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.cp_set_payroll_access(a,u,true);
  saved=public.cp_save_payroll_workspace(0,'{"orders":[{"id":"one"}]}',u,'save');
  ASSERT saved->>'revision'='1';
  ASSERT (SELECT actor_name='Operator' AND actor_id=u AND actor_email='operator@example.test' AND changed_keys=ARRAY['orders'] FROM public.cp_payroll_workspace_audit WHERE revision=1);
  ASSERT (SELECT role='buyer' FROM public.profiles WHERE id=u);
  saved=public.cp_save_payroll_workspace(1,'{"orders":[{"id":"one"}]}',u,'save');
  ASSERT saved->>'revision'='1';
  BEGIN PERFORM public.cp_save_payroll_workspace(0,'{}',u,'save'); RAISE EXCEPTION 'Stale revision accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM public.cp_set_payroll_access(a,u,false);
  BEGIN PERFORM public.cp_save_payroll_workspace(1,'{}',u,'save'); RAISE EXCEPTION 'Revoked user authorized'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT (SELECT count(*)=1 FROM public.cp_payroll_workspace_audit);
  ASSERT (SELECT count(*)=2 FROM public.cp_payroll_access_audit);
  ASSERT NOT has_table_privilege('authenticated','public.cp_payroll_access','SELECT');
  ASSERT NOT has_table_privilege('authenticated','public.cp_payroll_workspace_audit','SELECT');
  ASSERT NOT has_table_privilege('service_role','public.cp_payroll_workspace_audit','UPDATE');
  ASSERT NOT has_table_privilege('service_role','public.cp_payroll_access_audit','DELETE');
  ASSERT NOT has_function_privilege('authenticated','public.cp_set_payroll_access(uuid,uuid,boolean)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','public.cp_save_payroll_workspace(bigint,jsonb,uuid,text)','EXECUTE');
END $$;
RESET ROLE;
