-- ============================================================
-- Activity log (audit trail) — run AFTER 005_ending_float.sql
--
-- Orders and payments are logged by DATABASE TRIGGERS so the app
-- cannot skip or fake them. Staff sign-in/out events are inserted
-- by the app (policy below restricts them to the user's own id).
-- Rows are immutable — no update/delete policies on purpose.
-- ============================================================

create table public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references public.tenants(id) on delete cascade,
  branch_id  uuid references public.branches(id) on delete cascade,
  actor_id   uuid,                                -- staff id, null for customers
  actor_name text not null,                       -- snapshot at event time
  action     text not null check (action in (
    'order_placed','order_status_changed',
    'payment_settled','payment_undone',
    'staff_signed_in','staff_signed_out'
  )),
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_tenant_created on public.activity_logs(tenant_id, created_at desc);
create index idx_activity_branch_created on public.activity_logs(branch_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- Writer helper (security definer → triggers can always insert)
-- ────────────────────────────────────────────────────────────
create or replace function public.log_activity(
  p_tenant uuid, p_branch uuid, p_actor uuid, p_actor_name text,
  p_action text, p_details jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.activity_logs (tenant_id, branch_id, actor_id, actor_name, action, details)
  values (p_tenant, p_branch, p_actor, p_actor_name, p_action, coalesce(p_details, '{}'::jsonb));
$$;

-- ────────────────────────────────────────────────────────────
-- Order + payment events
-- ────────────────────────────────────────────────────────────
create or replace function public.log_order_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_staff_name text;
begin
  select tenant_id into v_tenant from public.branches where id = new.branch_id;

  if tg_op = 'INSERT' then
    perform public.log_activity(
      v_tenant, new.branch_id, null,
      coalesce(nullif(new.customer_name, ''), 'Customer'),
      'order_placed',
      jsonb_build_object('order_number', new.order_number, 'total', new.total)
    );
    return new;
  end if;

  -- UPDATE: attribute to the signed-in staff member.
  select name into v_staff_name from public.staff where id = auth.uid();

  if new.order_status is distinct from old.order_status then
    perform public.log_activity(
      v_tenant, new.branch_id, auth.uid(), coalesce(v_staff_name, 'Staff'),
      'order_status_changed',
      jsonb_build_object('order_number', new.order_number,
                         'from', old.order_status, 'to', new.order_status)
    );
  end if;

  if old.payment_status = 'unpaid' and new.payment_status = 'paid' then
    perform public.log_activity(
      v_tenant, new.branch_id, auth.uid(), coalesce(v_staff_name, 'Staff'),
      'payment_settled',
      jsonb_build_object('order_number', new.order_number, 'total', new.total,
                         'amount_paid', new.amount_paid, 'change_due', new.change_due)
    );
  elsif old.payment_status = 'paid' and new.payment_status = 'unpaid' then
    perform public.log_activity(
      v_tenant, new.branch_id, auth.uid(), coalesce(v_staff_name, 'Staff'),
      'payment_undone',
      jsonb_build_object('order_number', new.order_number)
    );
  end if;

  return new;
end $$;

create trigger trg_orders_activity_ins after insert on public.orders
  for each row execute function public.log_order_activity();
create trigger trg_orders_activity_upd after update on public.orders
  for each row execute function public.log_order_activity();

-- ────────────────────────────────────────────────────────────
-- Row level security
-- ────────────────────────────────────────────────────────────
alter table public.activity_logs enable row level security;

create policy activity_select on public.activity_logs for select using (
  public.my_role() = 'super_admin'
  or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant())
  or (public.my_role() = 'branch_admin' and branch_id = public.my_branch())
);

-- App may only write the user's OWN session events; everything else
-- comes from the security-definer triggers above.
create policy activity_insert_session on public.activity_logs for insert
  with check (
    actor_id = auth.uid()
    and action in ('staff_signed_in', 'staff_signed_out')
  );
