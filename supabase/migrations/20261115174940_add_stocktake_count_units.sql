alter table public.inventory_counts
  add column if not exists count_unit_ar text,
  add column if not exists count_unit_en text;
