-- Allow multiple people per handoff type and the same person in multiple types.
-- Review and execute manually in Supabase. Existing rows are preserved.
BEGIN;

ALTER TABLE public.outreach_handoff_recipients
  DROP CONSTRAINT outreach_handoff_recipients_pkey;
ALTER TABLE public.outreach_handoff_recipients
  ADD CONSTRAINT outreach_handoff_recipients_pkey PRIMARY KEY (user_id, kind);

CREATE OR REPLACE FUNCTION public.admin_set_developer_handoff_recipient(
  p_user_id uuid, p_enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.team_permissions a
    WHERE a.user_id = auth.uid() AND a.active = true AND upper(a.role) = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Recipient and enabled state are required';
  END IF;
  IF p_enabled AND NOT EXISTS (
    SELECT 1 FROM public.team_permissions p
    JOIN public.callcenter_profiles c ON c.user_id = p.user_id
    WHERE p.user_id = p_user_id
      AND p.active = true
      AND upper(p.role) IN ('BUILDER', 'ADMIN')
      AND c.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Recipient must be an active BUILDER or ADMIN';
  END IF;
  IF p_enabled THEN
    INSERT INTO public.outreach_handoff_recipients (user_id,kind,active)
    VALUES (p_user_id,'development',true)
    ON CONFLICT (user_id,kind) DO UPDATE SET active=EXCLUDED.active;
  ELSE
    UPDATE public.outreach_handoff_recipients
    SET active=false WHERE user_id=p_user_id AND kind='development';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_developer_handoff_recipient(uuid,boolean)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_developer_handoff_recipient(uuid,boolean)
  TO authenticated;
COMMIT;
