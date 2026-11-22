-- NOVARO formula storage: isolated from operational business data.
-- Every cell authorization is re-checked against the existing source record and RLS model.
create table public.formula_cells (
  cell_id text primary key,
  formula text not null,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint formula_cells_cell_id_length check (length(cell_id) between 1 and 1024),
  constraint formula_cells_formula_length check (
    length(btrim(formula)) between 2 and 4000
    and left(btrim(formula), 1) = '='
  )
);

alter table public.formula_cells enable row level security;

create or replace function private.can_access_formula_cell(
  target_cell_id text,
  requested_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_parts text[];
  v_branch uuid;
  v_session uuid;
  v_item uuid;
  v_role uuid;
  v_sheet uuid;
  v_day integer;
  v_month text;
  v_metric text;
  v_exists boolean := false;
begin
  if auth.uid() is null
     or requested_action not in ('read', 'edit')
     or target_cell_id is null
     or length(target_cell_id) > 1024 then
    return false;
  end if;

  v_parts := string_to_array(target_cell_id, '|');
  if v_parts[1] <> 'NOVARO' then
    return false;
  end if;

  if v_parts[2] = 'inventory'
     and array_length(v_parts, 1) = 6
     and v_parts[6] = 'counted_quantity'
     and v_parts[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and v_parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and v_parts[5] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_branch := v_parts[3]::uuid;
    v_session := v_parts[4]::uuid;
    v_item := v_parts[5]::uuid;
    select exists (
      select 1
      from public.inventory_counts c
      join public.inventory_sessions s on s.id = c.session_id
      where c.session_id = v_session
        and c.item_id = v_item
        and s.branch_id = v_branch
    ) into v_exists;
    if not v_exists then return false; end if;
    if requested_action = 'read' then
      return private.can_access_branch(v_branch);
    end if;
    return private.is_owner_admin()
      or exists (
        select 1 from public.inventory_sessions s
        where s.id = v_session and s.branch_id = v_branch
          and s.status in ('draft', 'in_progress')
          and private.can_count_branch(v_branch)
      );
  end if;

  if v_parts[2] = 'item'
     and array_length(v_parts, 1) = 4
     and v_parts[4] = 'min_stock'
     and v_parts[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_item := v_parts[3]::uuid;
    if requested_action = 'read' then
      return exists (
        select 1 from public.items i
        where i.id = v_item
          and (
            private.is_owner_admin()
            or (
              i.is_active = true
              and (i.created_branch_id is null or private.can_access_branch(i.created_branch_id))
            )
          )
      );
    end if;
    return private.is_owner_admin() or exists (
      select 1 from public.items i
      where i.id = v_item
        and i.created_branch_id is not null
        and private.can_count_branch(i.created_branch_id)
    );
  end if;

  if v_parts[2] = 'branch'
     and array_length(v_parts, 1) = 4
     and v_parts[4] = 'required_headcount'
     and v_parts[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_branch := v_parts[3]::uuid;
    if requested_action = 'edit' then
      return private.is_owner_admin()
        and exists (select 1 from public.branches b where b.id = v_branch);
    end if;
    return private.can_access_branch(v_branch)
      and exists (select 1 from public.branches b where b.id = v_branch);
  end if;

  if v_parts[2] = 'headcount'
     and array_length(v_parts, 1) = 5
     and v_parts[5] = 'required_count'
     and v_parts[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and v_parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_branch := v_parts[3]::uuid;
    v_role := v_parts[4]::uuid;
    select exists (
      select 1 from public.branch_headcount_roles h
      where h.id = v_role and h.branch_id = v_branch
    ) into v_exists;
    if not v_exists then return false; end if;
    if requested_action = 'read' then
      return private.can_access_branch(v_branch);
    end if;
    return private.is_owner_admin() or exists (
      select 1
      from public.branch_members bm
      join public.profiles p on p.id = bm.user_id
      where bm.branch_id = v_branch
        and bm.user_id = auth.uid()
        and bm.is_active = true
        and p.is_active = true
        and p.role = 'branch_manager'
    );
  end if;

  if v_parts[2] = 'sales'
     and array_length(v_parts, 1) = 5
     and v_parts[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and v_parts[4] ~ '^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{4}$'
     and v_parts[5] in ('sales_target', 'yesterday_tip', 'month_to_date_tip') then
    v_branch := v_parts[3]::uuid;
    v_month := v_parts[4];
    v_metric := v_parts[5];
    if v_metric = 'sales_target' then
      select exists (
        select 1 from public.sales_report_targets t
        where t.branch_id = v_branch and t.report_month = v_month
      ) into v_exists;
    else
      select exists (
        select 1 from public.sales_report_months m
        where m.branch_id = v_branch and m.report_month = v_month
      ) into v_exists;
    end if;
    return v_exists and private.can_edit_sales_report_branch(v_branch);
  end if;

  if v_parts[2] = 'statistics'
     and (
       (array_length(v_parts, 1) = 7
        and v_parts[6] in ('dinein', 'takeaway', 'delivery', 'catering')
        and v_parts[7] in ('tickets', 'sales'))
       or
       (array_length(v_parts, 1) = 6 and v_parts[6] = 'daily_target')
     )
     and v_parts[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and v_parts[4] ~ '^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{4}$'
     and v_parts[5] ~ '^[0-9]{1,2}$' then
    v_branch := v_parts[3]::uuid;
    v_month := v_parts[4];
    v_day := v_parts[5]::integer;
    if v_day < 1 or v_day > 31 then return false; end if;
    v_exists := exists (
      select 1 from public.sales_report_statistics_entries s
      where s.branch_id = v_branch
        and s.report_month = v_month
        and s.report_day = v_day
    );
    return v_exists and private.can_edit_sales_report_branch(v_branch);
  end if;

  if v_parts[2] = 'daily_tip'
     and array_length(v_parts, 1) = 7
     and v_parts[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and v_parts[4] ~ '^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{4}$'
     and v_parts[5] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and v_parts[6] ~ '^[0-9]{1,2}$'
     and v_parts[7] in ('tip_amount', 'dinein_sales') then
    v_branch := v_parts[3]::uuid;
    v_month := v_parts[4];
    v_sheet := v_parts[5]::uuid;
    v_day := v_parts[6]::integer;
    if v_day < 1 or v_day > 31 then return false; end if;
    v_exists := exists (
      select 1
      from public.sales_report_tip_sheets ts
      where ts.id = v_sheet
        and ts.branch_id = v_branch
        and ts.report_month = v_month
        and jsonb_typeof(ts.rows) = 'array'
        and exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(ts.rows) = 'array' then ts.rows else '[]'::jsonb end
          ) as row_value
          where row_value ->> 'day' = v_day::text
        )
    );
    return v_exists and private.can_edit_sales_report_branch(v_branch);
  end if;

  return false;
exception
  when others then
    return false;
end;
$function$;

create or replace function private.touch_formula_cell()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

create trigger formula_cells_touch_updated_at
before update on public.formula_cells
for each row execute function private.touch_formula_cell();

revoke all on table public.formula_cells from anon, authenticated;
grant select, delete on table public.formula_cells to authenticated;
grant insert (cell_id, formula) on table public.formula_cells to authenticated;
grant update (formula) on table public.formula_cells to authenticated;

revoke all on function private.can_access_formula_cell(text, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_access_formula_cell(text, text) to authenticated;

create policy formula_cells_read_source_scope
on public.formula_cells
for select
to authenticated
using (private.can_access_formula_cell(cell_id, 'read'));

create policy formula_cells_insert_edit_scope
on public.formula_cells
for insert
to authenticated
with check (private.can_access_formula_cell(cell_id, 'edit'));

create policy formula_cells_update_edit_scope
on public.formula_cells
for update
to authenticated
using (private.can_access_formula_cell(cell_id, 'edit'))
with check (private.can_access_formula_cell(cell_id, 'edit'));

create policy formula_cells_delete_edit_scope
on public.formula_cells
for delete
to authenticated
using (private.can_access_formula_cell(cell_id, 'edit'));
