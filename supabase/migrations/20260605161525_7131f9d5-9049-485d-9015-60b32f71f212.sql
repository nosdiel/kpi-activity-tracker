ALTER TABLE public.toast_report_jobs
  ADD COLUMN IF NOT EXISTS fiscal_year integer,
  ADD COLUMN IF NOT EXISTS fiscal_week integer;

CREATE UNIQUE INDEX IF NOT EXISTS toast_report_jobs_loc_fy_week_type_idx
  ON public.toast_report_jobs (location_id, fiscal_year, fiscal_week, report_type)
  NULLS NOT DISTINCT;