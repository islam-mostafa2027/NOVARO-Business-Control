-- Remove duplicate unique indexes while preserving the existing uniqueness guarantees.
-- The inventory_counts constraint-owned index is retained.
drop index if exists public.headcount_job_titles_title_unique;
drop index if exists public.inventory_counts_session_item_uidx;
