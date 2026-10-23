-- Batch 5: independent developer work status; no CRM ownership changes.
-- REVIEW FIRST. Run manually in Supabase SQL Editor, not executed by ChatGPT.
BEGIN;
ALTER TABLE public.outreach_lead_handoffs
 ADD COLUMN IF NOT EXISTS work_status text NOT NULL DEFAULT 'new';
ALTER TABLE public.outreach_lead_handoffs
 DROP CONSTRAINT IF EXISTS outreach_lead_handoffs_work_status_check;
ALTER TABLE public.outreach_lead_handoffs
 ADD CONSTRAINT outreach_lead_handoffs_work_status_check
 CHECK (work_status IN ('new','in_progress','completed'));

CREATE OR REPLACE FUNCTION public.admin_development_handoff_statuses()
RETURNS TABLE(handoff_id uuid, work_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT h.id,h.work_status
 FROM public.outreach_lead_handoffs h
 WHERE h.kind='development'
   AND EXISTS (
     SELECT 1 FROM public.team_permissions p
     WHERE p.user_id=auth.uid() AND p.active=true AND upper(p.role)='ADMIN'
   )
 ORDER BY h.created_at DESC LIMIT 300;
$$;
REVOKE ALL ON FUNCTION public.admin_development_handoff_statuses() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_development_handoff_statuses() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_development_handoff_status(
 p_handoff_id uuid, p_status text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.team_permissions p
   WHERE p.user_id=auth.uid() AND p.active=true AND upper(p.role)='ADMIN'
 ) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF p_status NOT IN ('new','in_progress','completed') THEN
   RAISE EXCEPTION 'Invalid status';
 END IF;
 UPDATE public.outreach_lead_handoffs
 SET work_status=p_status
 WHERE id=p_handoff_id AND kind='development';
 IF NOT FOUND THEN RAISE EXCEPTION 'Development handoff not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_development_handoff_status(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_development_handoff_status(uuid,text) TO authenticated;
COMMIT;
