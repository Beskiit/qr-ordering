-- ============================================================
-- Drawer closings in the activity log — run AFTER 006_activity_logs.sql
-- Every cash count writes a 'drawer_closed' entry (via trigger)
-- with the float, counted cash, what was left, and the variance.
-- ============================================================

-- Allow the new action value.
alter table public.activity_logs drop constraint activity_logs_action_check;
alter table public.activity_logs add constraint activity_logs_action_check
  check (action in (
    'order_placed','order_status_changed',
    'payment_settled','payment_undone',
    'staff_signed_in','staff_signed_out',
    'drawer_closed'
  ));

create or replace function public.log_drawer_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.branches where id = new.branch_id;
  perform public.log_activity(
    v_tenant, new.branch_id, new.staff_id, new.staff_name,
    'drawer_closed',
    jsonb_build_object(
      'starting_float', new.starting_float,
      'expected_cash',  new.expected_cash,
      'counted_cash',   new.counted_cash,
      'variance',       new.variance,
      'left_in_drawer', new.left_in_drawer
    )
  );
  return new;
end $$;

create trigger trg_cash_counts_activity after insert on public.cash_counts
  for each row execute function public.log_drawer_activity();
