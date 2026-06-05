ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS toast_analytics_client_id text,
  ADD COLUMN IF NOT EXISTS toast_analytics_client_secret text;