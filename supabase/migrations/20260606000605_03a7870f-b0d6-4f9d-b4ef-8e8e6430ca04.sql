
-- 1. Lock down sensitive credential columns on locations
REVOKE SELECT (
  square_access_token,
  toast_client_secret,
  toast_analytics_client_secret,
  toast_client_id,
  toast_analytics_client_id
) ON public.locations FROM anon, authenticated;

-- 2. vendor_contacts: admin-only SELECT
DROP POLICY IF EXISTS "vendor_contacts read authenticated" ON public.vendor_contacts;
CREATE POLICY "vendor_contacts admin read"
  ON public.vendor_contacts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 3. pos_sync_log: admin-only SELECT
DROP POLICY IF EXISTS "pos_sync_log read" ON public.pos_sync_log;
CREATE POLICY "pos_sync_log admin read"
  ON public.pos_sync_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 4. toast_report_jobs: admin-only SELECT
DROP POLICY IF EXISTS "toast_report_jobs read" ON public.toast_report_jobs;
DROP POLICY IF EXISTS "toast_report_jobs read authenticated" ON public.toast_report_jobs;
CREATE POLICY "toast_report_jobs admin read"
  ON public.toast_report_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
