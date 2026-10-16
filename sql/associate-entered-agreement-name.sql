-- Run in the same Supabase project as the existing agreement actions.
-- v2 remains responsible for authorization, document validation and issuance.
-- Its legacy required associate_name gets a non-personal pending label;
-- the associate's actual legal name is stored in signature_name on completion.
-- No existing assignments, completed PDFs, grants or RLS policies are changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.sh_admin_issue_agreement_action_v3(
  p_user_id uuid,
  p_document_key text,
  p_effective_date date,
  p_work_location text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT to_jsonb(public.sh_admin_issue_agreement_action_v2(
    p_user_id := p_user_id,
    p_document_key := p_document_key,
    p_associate_name := 'Awaiting associate entry',
    p_effective_date := p_effective_date,
    p_work_location := p_work_location
  ));
$$;

REVOKE ALL ON FUNCTION public.sh_admin_issue_agreement_action_v3(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sh_admin_issue_agreement_action_v3(uuid, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sh_admin_issue_agreement_action_v3(uuid, text, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
