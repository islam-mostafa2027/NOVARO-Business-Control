-- Keep deletion of saved daily sales snapshots restricted to the owner.
-- Branch managers can still read and edit their own branch reports via the existing policies.
drop policy if exists sales_report_daily_entries_delete_owner_only
  on public.sales_report_daily_entries;

create policy sales_report_daily_entries_delete_owner_only
  on public.sales_report_daily_entries
  for delete
  to authenticated
  using (private.is_owner_admin());
