-- ============================================================
-- Order types (dine-in / walk-in / pickup / delivery) + tenant
-- payment methods (GCash / Maya / Bank e-wallet QR). Run AFTER 010.
-- ============================================================

-- 1. Order type. Customer QR orders default to dine-in.
alter table public.orders
  add column if not exists order_type text not null default 'dine_in'
    check (order_type in ('dine_in', 'walk_in', 'pickup', 'delivery'));

-- 2. Tenant payment methods — the e-wallet / bank QR a customer can pay to.
create table public.payment_methods (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  type           text not null check (type in ('gcash', 'maya', 'bank')),
  account_name   text,
  account_number text,
  qr_url         text,                       -- uploaded QR image (public storage)
  is_enabled     boolean not null default true,
  display_order  int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, type)
);

create index idx_payment_methods_tenant on public.payment_methods(tenant_id);

create trigger trg_payment_methods_updated before update on public.payment_methods
  for each row execute function public.set_updated_at();

alter table public.payment_methods enable row level security;

-- Customers (anon) may read ENABLED methods so they can pay; the owning
-- tenant admin (and super admin) can read/manage their own, enabled or not.
create policy payment_methods_select on public.payment_methods for select
  using (
    is_enabled
    or public.my_role() = 'super_admin'
    or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant())
  );

create policy payment_methods_write on public.payment_methods for all
  using (
    public.my_role() = 'super_admin'
    or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant())
  )
  with check (
    public.my_role() = 'super_admin'
    or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant())
  );

-- 3. staff_create_order now records the order type (walk-in/pickup/delivery).
drop function if exists public.staff_create_order(uuid, uuid, jsonb, text);
create or replace function public.staff_create_order(
  p_branch_id uuid,
  p_table_id uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_order_type text default 'walk_in'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_order_no text;
  v_subtotal numeric(10,2);
begin
  if not public.can_access_branch(p_branch_id) then
    raise exception 'Not allowed to create orders for this branch';
  end if;
  if p_order_type not in ('dine_in', 'walk_in', 'pickup', 'delivery') then
    raise exception 'Invalid order type';
  end if;
  if p_table_id is not null and not exists (
    select 1 from public.tables where id = p_table_id and branch_id = p_branch_id
  ) then
    raise exception 'Invalid table for this branch';
  end if;

  v_order_no := 'ORD-' || to_char(now(), 'YYMMDD') || '-' ||
                upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (branch_id, table_id, order_number, customer_name, order_type, subtotal, tax, total)
  values (p_branch_id, p_table_id, v_order_no, p_customer_name, p_order_type, 0, 0, 0)
  returning id into v_order_id;

  v_subtotal := public.add_order_items(v_order_id, p_branch_id, p_items);

  update public.orders set subtotal = v_subtotal, tax = 0, total = v_subtotal where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_subtotal);
end $$;

grant execute on function public.staff_create_order(uuid, uuid, jsonb, text, text) to authenticated;

-- 4. track_order includes the order type so the customer page can label it.
create or replace function public.track_order(p_order_number text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
  v_table_number text;
begin
  select * into v_order from public.orders where order_number = p_order_number;
  if not found then return null; end if;

  select table_number into v_table_number from public.tables where id = v_order.table_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_name', product_name,
           'variant_name', variant_name,
           'addons', addons,
           'quantity', quantity,
           'unit_price', unit_price,
           'subtotal', subtotal,
           'notes', notes)), '[]'::jsonb)
    into v_items
    from public.order_items where order_id = v_order.id;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'order_status', v_order.order_status,
    'payment_status', v_order.payment_status,
    'order_type', v_order.order_type,
    'table_number', v_table_number,
    'subtotal', v_order.subtotal,
    'total', v_order.total,
    'created_at', v_order.created_at,
    'items', v_items
  );
end $$;
