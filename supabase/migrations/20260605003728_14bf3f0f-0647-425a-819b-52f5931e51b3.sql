
-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin','admin','regional_manager','store_manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sales_source AS ENUM ('square','toast','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles read all authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- user_roles + has_role
-- ============================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles read own or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- regions
-- ============================================================
CREATE TABLE public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regions TO authenticated;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regions all authenticated" ON public.regions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- locations
-- ============================================================
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  region text,
  timezone text DEFAULT 'America/New_York',
  address text,
  active boolean NOT NULL DEFAULT true,
  pos_provider text,
  square_location_id text,
  square_access_token text,
  toast_credential_name text,
  toast_api_url text,
  toast_restaurant_guid text,
  toast_client_id text,
  toast_client_secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
-- Hide secret columns from PostgREST clients
REVOKE SELECT (square_access_token, toast_client_secret) ON public.locations FROM anon, authenticated;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations all authenticated" ON public.locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- user_locations
-- ============================================================
CREATE TABLE public.user_locations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);
GRANT SELECT ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_locations read own or admin" ON public.user_locations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- fiscal_year_settings
-- ============================================================
CREATE TABLE public.fiscal_year_settings (
  fiscal_year integer PRIMARY KEY,
  start_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_year_settings TO authenticated;
GRANT ALL ON public.fiscal_year_settings TO service_role;
ALTER TABLE public.fiscal_year_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy all authenticated" ON public.fiscal_year_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- daily_sales
-- ============================================================
CREATE TABLE public.daily_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  total_cents bigint,
  actual_sales numeric(12,2),
  actual_customer_count integer,
  last_year_sales numeric(12,2),
  last_year_customer_count integer,
  dessert_count integer,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, business_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_sales TO authenticated;
GRANT ALL ON public.daily_sales TO service_role;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_sales all authenticated" ON public.daily_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER daily_sales_updated_at BEFORE UPDATE ON public.daily_sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- weekly_pnl
-- ============================================================
CREATE TABLE public.weekly_pnl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  fiscal_year integer,
  fiscal_week integer,
  week_start_date date,
  catering numeric(12,2),
  wages numeric(12,2),
  repairs numeric(12,2),
  beer_wine_cost numeric(12,2),
  vendor_amounts jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, fiscal_year, fiscal_week)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_pnl TO authenticated;
GRANT ALL ON public.weekly_pnl TO service_role;
ALTER TABLE public.weekly_pnl ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weekly_pnl all authenticated" ON public.weekly_pnl FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER weekly_pnl_updated_at BEFORE UPDATE ON public.weekly_pnl FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- weekly_targets
-- ============================================================
CREATE TABLE public.weekly_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  fiscal_year integer,
  fiscal_week integer,
  week_start_date date,
  sales_target numeric(12,2),
  customer_target integer,
  dessert_target integer,
  target_pct_over_ly numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, fiscal_year, fiscal_week)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_targets TO authenticated;
GRANT ALL ON public.weekly_targets TO service_role;
ALTER TABLE public.weekly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weekly_targets all authenticated" ON public.weekly_targets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER weekly_targets_updated_at BEFORE UPDATE ON public.weekly_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- vendor_contacts
-- ============================================================
CREATE TABLE public.vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  category text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_contacts TO authenticated;
GRANT ALL ON public.vendor_contacts TO service_role;
ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_contacts all authenticated" ON public.vendor_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER vendor_contacts_updated_at BEFORE UPDATE ON public.vendor_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- trackable_items
-- ============================================================
CREATE TABLE public.trackable_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  active_from date,
  active_to date,
  pos_product text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trackable_items TO authenticated;
GRANT ALL ON public.trackable_items TO service_role;
ALTER TABLE public.trackable_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trackable_items all authenticated" ON public.trackable_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- pos_sync_log
-- ============================================================
CREATE TABLE public.pos_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  status text NOT NULL,
  total_cents bigint,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pos_sync_log TO authenticated;
GRANT ALL ON public.pos_sync_log TO service_role;
ALTER TABLE public.pos_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_sync_log read" ON public.pos_sync_log FOR SELECT TO authenticated USING (true);

-- ============================================================
-- toast_report_jobs
-- ============================================================
CREATE TABLE public.toast_report_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  report_type text NOT NULL,
  report_request_guid text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed','rate_limited')),
  rows jsonb,
  error text,
  attempt_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX toast_report_jobs_loc_date_type_idx ON public.toast_report_jobs (location_id, business_date, report_type);
CREATE INDEX toast_report_jobs_status_idx ON public.toast_report_jobs (status, updated_at);
GRANT SELECT ON public.toast_report_jobs TO authenticated;
GRANT ALL ON public.toast_report_jobs TO service_role;
ALTER TABLE public.toast_report_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "toast_report_jobs read" ON public.toast_report_jobs FOR SELECT TO authenticated USING (true);

-- ============================================================
-- role_permissions
-- ============================================================
CREATE TABLE public.role_permissions (
  role public.app_role NOT NULL,
  section text NOT NULL,
  PRIMARY KEY (role, section)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions read" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions admin write" ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
