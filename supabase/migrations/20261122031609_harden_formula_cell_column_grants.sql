-- Restore column-level least-privilege grants on the isolated formula store.
-- Keep SELECT/DELETE table grants and source-aware RLS unchanged.
-- Formula creators must not be able to spoof audit fields or rewrite cell IDs.
revoke insert, update on table public.formula_cells from authenticated;

grant insert (cell_id, formula)
  on table public.formula_cells to authenticated;

grant update (formula)
  on table public.formula_cells to authenticated;
