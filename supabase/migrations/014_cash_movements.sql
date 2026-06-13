-- ============================================================
-- Cash management — petty-cash movements in/out of the drawer.
-- Run AFTER 013.
--   • cash_movements: money added to (in) or taken from (out) the
--     drawer that ISN'T a sale — e.g. paying for supplies (out) or
--     adding change (in). Each is +/- to the drawer's expected cash.
--   • Logged to the activity feed (cash_in / cash_out) with the staff
--     who recorded it. Rows are immutable history (no update/delete).
-- ============================================================

create table public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id) on delete cascade,
  staff_id    uuid references public.staff(id) on delete set null,
  staff_name  text not null,                         -- snapshot at log time
  direction   text not null check (direction in ('in', 'out')),
  amount      numeric(10,2) not null check (amount > 0),
  reason      text,
  created_at  timestamptz not null default now()     -- automatic timestamp
);

create index idx_cash_movements_branch
  on public.cash_movements(branch_id, created_at desc);

alter table public.cash_movements enable row level security;

create policy cash_movements_select on public.cash_movements for select
  using (public.can_access_branch(branch_id));
create policy cash_movements_insert on public.cash_movements for insert
  with check (public.can_access_branch(branch_id));

-- Allow the two new activity actions.
alter table public.activity_logs drop constraint activity_logs_action_check;
alter table public.activity_logs add constraint activity_logs_action_check
  check (action in (
    'order_placed','order_status_changed',
    'payment_settled','payment_undone',
    'staff_signed_in','staff_signed_out',
    'drawer_closed','cash_in','cash_out'
  ));

create or replace function public.log_cash_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.branches where id = new.branch_id;
  perform public.log_activity(
    v_tenant, new.branch_id, new.staff_id, new.staff_name,
    case when new.direction = 'in' then 'cash_in' else 'cash_out' end,
    jsonb_build_object('amount', new.amount, 'reason', new.reason, 'direction', new.direction)
  );
  return new;
end $$;

create trigger trg_cash_movements_activity after insert on public.cash_movements
  for each row execute function public.log_cash_movement();
