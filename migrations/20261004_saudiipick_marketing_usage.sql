-- Saudi iPick desktop assignments are separate from retired Windsor assignments.
-- Apply in the Taager Orders Supabase project before releasing the desktop build.
CREATE TABLE IF NOT EXISTS public.saudiipick_marketing_mappings (
  license_key_hash text NOT NULL,
  dashboard_account_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('tiktok', 'snapchat')),
  source_account_id text NOT NULL,
  source_account_name text,
  source_currency text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (license_key_hash, dashboard_account_id, platform, source_account_id),
  UNIQUE (license_key_hash, platform, source_account_id)
);

ALTER TABLE public.saudiipick_marketing_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saudiipick_marketing_mappings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.taager_saudiipick_marketing_state(
  p_license_key text,
  p_machine_uuid text,
  p_device_id text,
  p_dashboard_account_id text,
  p_platform text,
  p_source_accounts jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed jsonb;
  license_hash text;
  account_id text := trim(coalesce(p_dashboard_account_id, ''));
  platform_id text := lower(trim(coalesce(p_platform, '')));
  account_limit integer := 2;
  requested_count integer := 0;
  used_count integer := 0;
  assigned jsonb := '[]'::jsonb;
BEGIN
  allowed := public.taager_license_credential_device_allowed(p_license_key, p_machine_uuid, p_device_id);
  IF coalesce((allowed->>'ok')::boolean, false) IS NOT TRUE THEN RETURN allowed; END IF;
  IF account_id = '' OR length(account_id) > 250 OR platform_id NOT IN ('tiktok', 'snapchat') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_account_or_platform');
  END IF;
  IF account_id = '__all__' THEN
    IF p_source_accounts IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'select_single_account'); END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.license_accounts
    WHERE license_key = allowed->>'license_key' AND account_hash = account_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'dashboard_account_not_licensed');
  END IF;
  license_hash := encode(sha256(convert_to(allowed->>'license_key', 'UTF8')), 'hex');

  -- Serialize changes across all Taager accounts on this license and platform.
  IF p_source_accounts IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(license_hash || ':' || platform_id, 0));
  END IF;
  SELECT max_source_accounts INTO account_limit
  FROM public.marketing_account_limits
  WHERE license_key_hash = license_hash AND dashboard_account_id = account_id AND platform = platform_id;
  account_limit := greatest(1, coalesce(account_limit, 2));

  IF p_source_accounts IS NOT NULL THEN
    IF jsonb_typeof(p_source_accounts) <> 'array' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_source_accounts');
    END IF;
    IF jsonb_array_length(p_source_accounts) > 1000 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_source_accounts');
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_source_accounts) item
      WHERE jsonb_typeof(item) <> 'object'
        OR length(trim(coalesce(item->>'id', ''))) NOT BETWEEN 1 AND 250
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_source_account');
    END IF;
    SELECT count(DISTINCT trim(item->>'id')) INTO requested_count
    FROM jsonb_array_elements(p_source_accounts) item;
    IF requested_count > account_limit THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'marketing_account_limit_exceeded', 'limit', account_limit, 'requested', requested_count);
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.saudiipick_marketing_mappings existing
      JOIN jsonb_array_elements(p_source_accounts) item ON existing.source_account_id = trim(item->>'id')
      WHERE existing.license_key_hash = license_hash
        AND existing.platform = platform_id
        AND existing.dashboard_account_id <> account_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'marketing_account_assigned_elsewhere');
    END IF;
    DELETE FROM public.saudiipick_marketing_mappings
    WHERE license_key_hash = license_hash AND dashboard_account_id = account_id AND platform = platform_id;
    INSERT INTO public.saudiipick_marketing_mappings
      (license_key_hash, dashboard_account_id, platform, source_account_id, source_account_name, source_currency)
    SELECT license_hash, account_id, platform_id, source_id,
      left(max(source_name), 300), left(max(source_currency), 20)
    FROM (
      SELECT trim(item->>'id') AS source_id,
        trim(coalesce(item->>'name', '')) AS source_name,
        upper(trim(coalesce(item->>'currency', ''))) AS source_currency
      FROM jsonb_array_elements(p_source_accounts) item
    ) requested
    GROUP BY source_id;
  END IF;

  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
    'id', source_account_id, 'name', coalesce(nullif(source_account_name, ''), source_account_id),
    'currency', source_currency) ORDER BY source_account_id), '[]'::jsonb)
  INTO used_count, assigned
  FROM public.saudiipick_marketing_mappings
  WHERE license_key_hash = license_hash AND dashboard_account_id = account_id AND platform = platform_id;
  RETURN jsonb_build_object('ok', true, 'provider', 'saudiipick', 'platform', platform_id,
    'dashboardAccountId', account_id, 'used', used_count, 'limit', account_limit, 'mappedAccounts', assigned);
END;
$$;

REVOKE ALL ON FUNCTION public.taager_saudiipick_marketing_state(text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.taager_saudiipick_marketing_state(text,text,text,text,text,jsonb) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
