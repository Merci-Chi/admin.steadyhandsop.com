-- Index area codes without duplicating CRM records in another table.
CREATE OR REPLACE FUNCTION public.crm_phone_area_code(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
 SELECT CASE WHEN n.national ~ '^[2-9][0-9]{9}$' THEN left(n.national,3) ELSE NULL END
 FROM (SELECT CASE WHEN length(d.digits)=11 AND left(d.digits,1)='1' THEN substr(d.digits,2) ELSE d.digits END AS national
       FROM (SELECT regexp_replace(regexp_replace(coalesce(p_phone,''),'(?i)(extension|ext[.]?|x|#).*$', ''),'[^0-9]','','g') AS digits) d) n;
$$;
CREATE INDEX IF NOT EXISTS crm_area_phone_idx ON public.crm (public.crm_phone_area_code(phone));
CREATE INDEX IF NOT EXISTS crm_area_altphone_idx ON public.crm (public.crm_phone_area_code(altphone));
CREATE OR REPLACE FUNCTION public.admin_crm_by_area_code(p_area_code text)
RETURNS SETOF public.crm LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_steadyhands_admin() THEN
  RAISE EXCEPTION 'Administrator access required' USING errcode='42501';
 END IF;
 IF p_area_code !~ '^[2-9][0-9]{2}$' THEN
  RAISE EXCEPTION 'Valid three-digit area code required' USING errcode='22023';
 END IF;
 RETURN QUERY SELECT c.* FROM public.crm c
  WHERE public.crm_phone_area_code(c.phone)=p_area_code
     OR public.crm_phone_area_code(c.altphone)=p_area_code;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_crm_by_area_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_crm_by_area_code(text) TO authenticated;
