-- One-time backfill: populate actual_sales from total_cents
UPDATE public.daily_sales
SET actual_sales = total_cents / 100.0
WHERE total_cents IS NOT NULL
  AND COALESCE(actual_sales, 0) = 0;
