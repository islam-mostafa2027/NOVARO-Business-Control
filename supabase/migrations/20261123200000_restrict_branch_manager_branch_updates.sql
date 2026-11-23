-- Restrict branch-manager updates to the branch's public profile fields.
-- Owner/admin and service-role operations retain their existing administrative scope.
create or replace function private.guard_branch_manager_branch_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if private.is_owner_admin() or (select auth.role()) = 'service_role' then
    return new;
  end if;

  if auth.uid() is null
     or not exists (
       select 1
       from public.profiles p
       join public.branch_members bm
         on bm.user_id = p.id
        and bm.branch_id = old.id
        and bm.is_active = true
        and bm.branch_role = 'branch_manager'
       where p.id = (select auth.uid())
         and p.is_active = true
         and p.role = 'branch_manager'
     )
     or old.is_active is not true
     or old.archived_at is not null
     or (old.branch_manager_user_id is distinct from (select auth.uid())
         and old.branch_login_user_id is distinct from (select auth.uid())) then
    raise exception 'Not authorized to update this branch'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.is_active is distinct from old.is_active
     or new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by
     or new.archived_member_states is distinct from old.archived_member_states
     or new.branch_login_email is distinct from old.branch_login_email
     or new.branch_login_manager_name is distinct from old.branch_login_manager_name
     or new.branch_login_manager_name_en is distinct from old.branch_login_manager_name_en
     or new.branch_login_user_id is distinct from old.branch_login_user_id
     or new.branch_manager_email is distinct from old.branch_manager_email
     or new.branch_manager_user_id is distinct from old.branch_manager_user_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.required_headcount is distinct from old.required_headcount then
    raise exception 'Branch managers may edit only branch name and address'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists branches_guard_manager_updates on public.branches;
create trigger branches_guard_manager_updates
before update on public.branches
for each row
execute function private.guard_branch_manager_branch_updates();

drop policy if exists branches_manager_update_own on public.branches;
create policy branches_manager_update_own
on public.branches
for update
to authenticated
using (
  exists (
    select 1
    from public.branch_members bm
    join public.profiles p on p.id = bm.user_id
    where bm.branch_id = branches.id
      and bm.user_id = (select auth.uid())
      and bm.is_active = true
      and bm.branch_role = 'branch_manager'
      and p.is_active = true
      and p.role = 'branch_manager'
      and branches.is_active = true
      and branches.archived_at is null
      and (
        branches.branch_manager_user_id = (select auth.uid())
        or branches.branch_login_user_id = (select auth.uid())
      )
  )
)
with check (
  exists (
    select 1
    from public.branch_members bm
    join public.profiles p on p.id = bm.user_id
    where bm.branch_id = branches.id
      and bm.user_id = (select auth.uid())
      and bm.is_active = true
      and bm.branch_role = 'branch_manager'
      and p.is_active = true
      and p.role = 'branch_manager'
      and branches.is_active = true
      and branches.archived_at is null
      and (
        branches.branch_manager_user_id = (select auth.uid())
        or branches.branch_login_user_id = (select auth.uid())
      )
  )
);
