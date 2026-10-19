-- Evaluate existing row-independent STABLE access checks once per SQL statement.
-- Roles, permissive/restrictive mode, function definitions, and grants stay intact.
-- No CRM rows are changed. Abort if the existing policies differ from those reviewed.
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crm' AND policyname='Admins view all crm leads' AND qual='is_steadyhands_admin()' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[]) THEN RAISE EXCEPTION 'Unexpected administrator read policy; no changes applied'; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='crm' AND policyname='sh_pause_guard' AND qual='sh_outreach_access_allowed()' AND with_check='sh_outreach_access_allowed()' AND cmd='ALL' AND permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[]) THEN RAISE EXCEPTION 'Unexpected pause guard; no changes applied'; END IF;
END $$;
ALTER POLICY "Admins view all crm leads" ON public.crm USING ((SELECT public.is_steadyhands_admin()));
ALTER POLICY sh_pause_guard ON public.crm USING ((SELECT public.sh_outreach_access_allowed())) WITH CHECK ((SELECT public.sh_outreach_access_allowed()));
