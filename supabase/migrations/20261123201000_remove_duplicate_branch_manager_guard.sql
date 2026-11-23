-- The existing novaro_guard_manager_branch_update trigger already enforces
-- the branch-manager field allowlist. Keep one authoritative guard only.
drop trigger if exists branches_guard_manager_updates on public.branches;
drop function if exists private.guard_branch_manager_branch_updates();
