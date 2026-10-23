-- Batch 4: Admin-only read access for shared Development Team leads.
-- Review and execute manually in Supabase. Does not reassign CRM ownership.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_development_handoffs()
RETURNS TABLE (
  handoff_id uuid,
  crm_id uuid,
  company text,
  contact text,
  phone text,
  handoff_notes text,
  recipient_name text,
  status text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT h.id, h.crm_id, c.company, c.name, c.phone, h.notes,
   COALESCE(NULLIF(cp.display_name,''),NULLIF(split_part(cp.email,'@',1),''),'Developer'),
   h.status, h.created_at
 FROM public.outreach_lead_handoffs h
 JOIN public.crm c ON c.id=h.crm_id
 LEFT JOIN public.callcenter_profiles cp ON cp.user_id=h.recipient_id
 WHERE h.kind='development'
 AND EXISTS (
   SELECT 1 FROM public.team_permissions p
   WHERE p.user_id=auth.uid() AND p.active=true AND upper(p.role)='ADMIN'
 )
 ORDER BY h.created_at DESC LIMIT 300;
$$;
REVOKE ALL ON FUNCTION public.admin_development_handoffs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_development_handoffs() TO authenticated;
COMMIT;
