
-- ============ PROFILES: scope reads to owner + admins ============
DROP POLICY IF EXISTS "profiles read all authenticated" ON public.profiles;
CREATE POLICY "profiles read own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============ LOCATIONS: keep reads, restrict writes, hide secret columns ============
DROP POLICY IF EXISTS "locations all authenticated" ON public.locations;
CREATE POLICY "locations read authenticated" ON public.locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "locations admin write" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "locations admin update" ON public.locations
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "locations admin delete" ON public.locations
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Hide POS secret columns from non-admins by replacing broad SELECT with
-- column-level grants. Service role (server code via supabaseAdmin) is
-- unaffected and continues to read everything.
REVOKE SELECT ON public.locations FROM authenticated;
GRANT SELECT (
  id, name, region, address, timezone, active,
  pos_provider, toast_credential_name,
  toast_api_url, toast_restaurant_guid, toast_client_id,
  square_location_id,
  created_at, updated_at
) ON public.locations TO authenticated;

-- ============ DAILY_SALES: keep reads, admin-only writes ============
DROP POLICY IF EXISTS "daily_sales all authenticated" ON public.daily_sales;
CREATE POLICY "daily_sales read authenticated" ON public.daily_sales
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "daily_sales admin write" ON public.daily_sales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "daily_sales admin update" ON public.daily_sales
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "daily_sales admin delete" ON public.daily_sales
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============ WEEKLY_PNL ============
DROP POLICY IF EXISTS "weekly_pnl all authenticated" ON public.weekly_pnl;
CREATE POLICY "weekly_pnl read authenticated" ON public.weekly_pnl
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "weekly_pnl admin write" ON public.weekly_pnl
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "weekly_pnl admin update" ON public.weekly_pnl
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "weekly_pnl admin delete" ON public.weekly_pnl
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============ WEEKLY_TARGETS ============
DROP POLICY IF EXISTS "weekly_targets all authenticated" ON public.weekly_targets;
CREATE POLICY "weekly_targets read authenticated" ON public.weekly_targets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "weekly_targets admin write" ON public.weekly_targets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "weekly_targets admin update" ON public.weekly_targets
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "weekly_targets admin delete" ON public.weekly_targets
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============ TRACKABLE_ITEMS ============
DROP POLICY IF EXISTS "trackable_items all authenticated" ON public.trackable_items;
DROP POLICY IF EXISTS "auth read trackable_items" ON public.trackable_items;
DROP POLICY IF EXISTS "auth write trackable_items" ON public.trackable_items;
DROP POLICY IF EXISTS "auth update trackable_items" ON public.trackable_items;
DROP POLICY IF EXISTS "auth delete trackable_items" ON public.trackable_items;
CREATE POLICY "trackable_items read authenticated" ON public.trackable_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "trackable_items admin write" ON public.trackable_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "trackable_items admin update" ON public.trackable_items
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "trackable_items admin delete" ON public.trackable_items
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============ VENDOR_CONTACTS ============
DROP POLICY IF EXISTS "vendor_contacts all authenticated" ON public.vendor_contacts;
CREATE POLICY "vendor_contacts read authenticated" ON public.vendor_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_contacts admin write" ON public.vendor_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "vendor_contacts admin update" ON public.vendor_contacts
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "vendor_contacts admin delete" ON public.vendor_contacts
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============ REGIONS ============
DROP POLICY IF EXISTS "regions all authenticated" ON public.regions;
CREATE POLICY "regions read authenticated" ON public.regions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "regions admin write" ON public.regions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "regions admin update" ON public.regions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "regions admin delete" ON public.regions
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ============ FISCAL_YEAR_SETTINGS ============
DROP POLICY IF EXISTS "fy all authenticated" ON public.fiscal_year_settings;
CREATE POLICY "fy read authenticated" ON public.fiscal_year_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "fy admin write" ON public.fiscal_year_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "fy admin update" ON public.fiscal_year_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "fy admin delete" ON public.fiscal_year_settings
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
