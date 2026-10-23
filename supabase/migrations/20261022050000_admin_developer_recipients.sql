-- Review in chat and execute manually in Supabase; never auto-applied.
-- Extends existing outreach_handoff_recipients table.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_developer_handoff_recipients()
RETURNS TABLE(
  user_id uuid, display_name text, email text, is_recipient boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.user_id,
         COALESCE(NULLIF(btrim(c.display_name), ''), split_part(c.email, '@', 1)) AS display_name,
         c.email,
         COALESCE(r.active, false) AS is_recipient
  FROM public.team_permissions p
  JOIN public.callcenter_profiles c ON c.user_id = p.user_id
  LEFT JOIN public.outreach_handoff_recipients r
    ON r.user_id = p.user_id AND r.kind = 'development'
  WHERE EXISTS (
    SELECT 1 FROM public.team_permissions admin
    WHERE admin.user_id = auth.uid() AND admin.active = true
      AND upper(admin.role) = 'ADMIN'
  )
    AND p.active = true
    AND upper(p.role) IN ('BUILDER', 'ADMIN')
    AND c.disabled_at IS NULL
  ORDER BY 2, 3
$$;

CREATE OR REPLACE FUNCTION public.admin_set_developer_handoff_recipient(
 p_user_id uuid, p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE existing_kind text;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.team_permissions a
   WHERE a.user_id = auth.uid()
     AND a.active = true
     AND upper(a.role) = 'ADMIN'
 ) THEN
   RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
 END IF;

 IF p_user_id IS NULL OR p_enabled IS NULL THEN
   RAISE EXCEPTION 'Recipient and enabled state are required';
 END IF;

 IF p_enabled AND NOT EXISTS (
   SELECT 1 FROM public.team_permissions p
   JOIN public.callcenter_profiles c ON c.user_id = p.user_id
   WHERE p.user_id = p_user_id AND p.active = true
     AND upper(p.role) IN ('BUILDER','ADMIN')
     AND c.disabled_at IS NULL
 ) THEN
   RAISE EXCEPTION 'Recipient must be an active BUILDER or ADMIN';
 END IF;

 SELECT kind INTO existing_kind
 FROM public.outreach_handoff_recipients WHERE user_id = p_user_id FOR UPDATE;

 IF existing_kind IS NOT NULL AND existing_kind <> 'development' THEN
   RAISE EXCEPTION 'This account is assigned to another handoff type. Change the recipient schema to enable multiple types.';
 END IF;

 IF p_enabled THEN
   INSERT INTO public.outreach_handoff_recipients(user_id,kind,active)
   VALUES (p_user_id,'development',true)
   ON CONFLICT (user_id) DO UPDATE SET active = true;
 ELSE
   UPDATE public.outreach_handoff_recipients SET active = false
   WHERE user_id = p_user_id AND kind = 'development';
 END IF;
END
$$;

REVOKE ALL ON FUNCTION public.admin_developer_handoff_recipients() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_developer_handoff_recipient(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_developer_handoff_recipients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_developer_handoff_recipient(uuid,boolean) TO authenticated;

COMMIT;
