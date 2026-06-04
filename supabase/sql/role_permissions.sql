-- Role-based section access matrix.
-- Each row = one (role, section) pair that is allowed. Missing row = denied.
-- super_admin is always allowed and is NOT stored here.

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  section text NOT NULL,
  PRIMARY KEY (role, section)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions read for authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions read for authenticated"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "role_permissions admin write" ON public.role_permissions;
CREATE POLICY "role_permissions admin write"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
