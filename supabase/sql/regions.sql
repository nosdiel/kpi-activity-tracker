-- Run this SQL in your Supabase SQL editor to enable Regions management.
CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.regions TO authenticated;
GRANT ALL ON public.regions TO service_role;

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read regions" ON public.regions;
CREATE POLICY "Authenticated can read regions"
  ON public.regions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert regions" ON public.regions;
CREATE POLICY "Authenticated can insert regions"
  ON public.regions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update regions" ON public.regions;
CREATE POLICY "Authenticated can update regions"
  ON public.regions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete regions" ON public.regions;
CREATE POLICY "Authenticated can delete regions"
  ON public.regions FOR DELETE TO authenticated USING (true);
