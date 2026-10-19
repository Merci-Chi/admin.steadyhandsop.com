-- DRAFT: apply only after reviewing the pipeline-history behavior below.
-- Unassigning a CRM lead preserves the last salesperson on historical pipeline rows.
-- Assigning it to a new salesperson still transfers linked pipeline records.
-- Keep NOT NULL, ownership guards, RLS, and audit triggers intact.
DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE t.tgrelid='public.crm'::regclass AND t.tgname='sh_pipeline_crm_assignment'
   AND p.proname='sh_pipeline_reassign_from_crm' AND p.prosecdef
   AND regexp_replace(p.prosrc,'\s','','g')=regexp_replace($body$
BEGIN
 IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
   UPDATE public.sh_pipeline_records SET salesperson_user_id=NEW.assigned_user_id WHERE crm_id=NEW.id::text;
 END IF;
 RETURN NEW;
END
$body$,'\s','','g')
 ) THEN RAISE EXCEPTION 'Pipeline assignment trigger differs from the reviewed version; no changes applied'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.sh_pipeline_reassign_from_crm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
 IF NEW.assigned_user_id IS NOT NULL AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
  UPDATE public.sh_pipeline_records SET salesperson_user_id=NEW.assigned_user_id WHERE crm_id=NEW.id::text;
 END IF;
 RETURN NEW;
END
$$;
