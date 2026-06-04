-- POS sync support, per-location credentials.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS pos_provider text,           -- 'square' | 'toast' | null
  ADD COLUMN IF NOT EXISTS square_location_id text,
  ADD COLUMN IF NOT EXISTS square_access_token text,    -- secret, read via service role only
  ADD COLUMN IF NOT EXISTS toast_credential_name text,
  ADD COLUMN IF NOT EXISTS toast_api_url text,
  ADD COLUMN IF NOT EXISTS toast_restaurant_guid text,
  ADD COLUMN IF NOT EXISTS toast_client_id text,
  ADD COLUMN IF NOT EXISTS toast_client_secret text;    -- secret

-- Keep secret columns out of the publishable-key view.
-- Anyone with a publishable token (anon/authenticated) can SELECT through PostgREST.
-- We block SELECT of secret columns by revoking column-level SELECT.
REVOKE SELECT (square_access_token, toast_client_secret) ON public.locations FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.pos_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                 -- 'square' | 'toast'
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  status text NOT NULL,                 -- 'ok' | 'error'
  total_cents bigint,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pos_sync_log TO authenticated;
GRANT ALL ON public.pos_sync_log TO service_role;

ALTER TABLE public.pos_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_sync_log read" ON public.pos_sync_log;
CREATE POLICY "pos_sync_log read"
  ON public.pos_sync_log FOR SELECT TO authenticated USING (true);
