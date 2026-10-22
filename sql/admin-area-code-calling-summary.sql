-- Steady Hands Admin — area-code availability
-- Run in the Supabase SQL Editor. No CRM records are modified.
-- Geographic time-zone display is handled by admin-area-code-picker.js and
-- admin-area-code-zones.json; CRM location values are optional.
CREATE OR REPLACE FUNCTION public.admin_area_code_calling_summary()
RETURNS TABLE (
  area_code text,
  state_code text,
  timezone text,
  uncalled_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_steadyhands_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT c.id, c.phone, c.altphone, c.state_code, c.timezone,
           c.lastcalled,
           lower(regexp_replace(coalesce(c.stage,''),'[^a-z]','','g')) AS normalized_stage,
           lower(regexp_replace(coalesce(c.outcome,''),'[^a-z]','','g')) AS normalized_outcome,
           coalesce(c.tags,'[]'::jsonb) AS lead_tags
    FROM public.crm c
    WHERE coalesce(c.admin_archived,false) = false
      AND coalesce(c.do_not_call,false) = false
      AND lower(regexp_replace(coalesce(c.stage,''),'[^a-z]','','g'))
          NOT IN ('donotcall','donotcontact','dnc','notinterested',
                  'complete','completed','sold','archived','cancelled')
      AND lower(regexp_replace(coalesce(c.outcome,''),'[^a-z]','','g'))
          NOT IN ('donotcall','donotcontact','dnc','notinterested',
                  'conversion','sold')
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(coalesce(c.tags,'[]'::jsonb))='array'
               THEN coalesce(c.tags,'[]'::jsonb) ELSE '[]'::jsonb END
        ) tag
        WHERE lower(regexp_replace(tag.value,'[^a-z]','','g'))
              IN ('donotcall','donotcontact','dnc')
      )
  ),
  per_number AS (
    SELECT e.id, e.state_code, e.timezone, e.lastcalled,
           e.normalized_outcome, e.lead_tags,
           CASE WHEN length(d.digits)=11 AND left(d.digits,1)='1'
                THEN substr(d.digits,2) ELSE d.digits END AS national
    FROM eligible e
    CROSS JOIN LATERAL (VALUES(e.phone),(e.altphone)) p(phone)
    CROSS JOIN LATERAL (
      SELECT regexp_replace(
        regexp_replace(coalesce(p.phone,''),'(?i)(extension|ext[.]?|x|#).*$', ''),
        '[^0-9]','','g') AS digits
    ) dd
  ),
  valid AS (
    SELECT DISTINCT id, state_code, timezone, lastcalled,
                    normalized_outcome, lead_tags,
                    substr(national,1,3) AS code
    FROM per_number
    WHERE national ~ '^[2-9][0-9]{9}$'
  ),
  annotated AS (
    SELECT v.*,
      (v.lastcalled IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.callcenter_call_activity a
        WHERE a.crm_id=v.id
          AND lower(coalesce(a.outcome,'')) <> 'did_not_call'
      ) AND v.normalized_outcome NOT IN ('noanswer','leftvoicemail','voicemail','busy')
        AND NOT (v.lead_tags @> '["No Answer"]'::jsonb
                 OR v.lead_tags @> '["Left Voicemail"]'::jsonb)
      ) AS never_called
    FROM valid v
  ),
  counts AS (
    SELECT a.code,
           count(DISTINCT a.id) FILTER (WHERE a.never_called) AS uncalled,
           count(DISTINCT a.id) AS total
    FROM annotated a
    GROUP BY a.code
    HAVING count(DISTINCT a.id) FILTER (WHERE a.never_called) > 0
  ),
  locations AS (
    SELECT a.code, a.state_code, a.timezone,
           row_number() OVER (
             PARTITION BY a.code
             ORDER BY count(*) DESC, a.state_code NULLS LAST, a.timezone NULLS LAST
           ) AS location_rank
    FROM annotated a
    GROUP BY a.code, a.state_code, a.timezone
  )
  SELECT counts.code, locations.state_code, locations.timezone,
         counts.uncalled, counts.total
  FROM counts
  JOIN locations ON locations.code=counts.code AND locations.location_rank=1;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_area_code_calling_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_area_code_calling_summary() TO authenticated;
, ''),
        '[^0-9]','','g') AS digits
    ) d
  ),
  valid AS (
    SELECT DISTINCT id, state_code, timezone, lastcalled,
                    normalized_outcome, lead_tags,
                    substr(national,1,3) AS code
    FROM per_number
    WHERE national ~ '^[2-9][0-9]{9}$'
  ),
  annotated AS (
    SELECT v.*,
      (v.lastcalled IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.callcenter_call_activity a
        WHERE a.crm_id=v.id
          AND lower(coalesce(a.outcome,'')) <> 'did_not_call'
      ) AND v.normalized_outcome NOT IN ('noanswer','leftvoicemail','voicemail','busy')
        AND NOT (v.lead_tags @> '["No Answer"]'::jsonb
                 OR v.lead_tags @> '["Left Voicemail"]'::jsonb)
      ) AS never_called
    FROM valid v
  ),
  counts AS (
    SELECT a.code,
           count(DISTINCT a.id) FILTER (WHERE a.never_called) AS uncalled,
           count(DISTINCT a.id) AS total
    FROM annotated a
    GROUP BY a.code
    HAVING count(DISTINCT a.id) FILTER (WHERE a.never_called) > 0
  ),
  locations AS (
    SELECT a.code, a.state_code, a.timezone,
           row_number() OVER (
             PARTITION BY a.code
             ORDER BY count(*) DESC, a.state_code NULLS LAST, a.timezone NULLS LAST
           ) AS location_rank
    FROM annotated a
    GROUP BY a.code, a.state_code, a.timezone
  )
  SELECT counts.code, locations.state_code, locations.timezone,
         counts.uncalled, counts.total
  FROM counts
  JOIN locations ON locations.code=counts.code AND locations.location_rank=1;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_area_code_calling_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_area_code_calling_summary() TO authenticated;
