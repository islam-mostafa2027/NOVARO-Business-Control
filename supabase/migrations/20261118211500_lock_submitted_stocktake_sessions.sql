-- Lock submitted stocktake sessions for non-owner users.
-- Branch managers may edit open sessions and submit them, but cannot
-- change a session after it has been submitted. System owners retain
-- full update access for review and correction.
drop policy if exists sessions_update_branch on public.inventory_sessions;

create policy sessions_update_branch
on public.inventory_sessions
for update
to authenticated
using (
  status in ('draft', 'in_progress')
  and private.can_manage_branch(branch_id)
)
with check (
  status in ('draft', 'in_progress', 'submitted')
  and private.can_manage_branch(branch_id)
);

drop policy if exists sessions_owner_update_all on public.inventory_sessions;

create policy sessions_owner_update_all
on public.inventory_sessions
for update
to authenticated
using (private.is_owner_admin())
with check (private.is_owner_admin());
