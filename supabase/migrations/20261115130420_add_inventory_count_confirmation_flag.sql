ALTER TABLE public.inventory_counts
ADD COLUMN IF NOT EXISTS is_counted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.inventory_counts.is_counted IS
'True only after a user explicitly saves the item count for this stocktake session.';
