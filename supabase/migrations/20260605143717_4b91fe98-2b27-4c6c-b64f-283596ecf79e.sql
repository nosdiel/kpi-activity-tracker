ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS food_cost_pct_of_sales numeric(5,2);
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS paper_goods_pct_of_sales numeric(5,2);