-- ============================================================
-- Per-item discounts. Run AFTER 017.
--   • discounts: named % discounts the tenant defines, toggizable.
--   • order_items gets an optional discount (id + snapshot name/%),
--     applied PER LINE — discounting one item doesn't touch the rest.
--   • staff_set_item_discount: apply/clear a discount on one line and
--     recompute the order total (re-priced server-side).
-- ============================================================

create table public.discounts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  percent     numeric(5,2) not null check (percent >= 0 and percent <= 100),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index idx_discounts_tenant on public.discounts(tenant_id);

alter table public.discounts enable row level security;

-- Any staff of the tenant can read its discounts (to apply them); only
-- tenant admins (and super admin) manage them.
create policy discounts_select on public.discounts for select
  using (public.my_role() = 'super_admin' or tenant_id = public.my_tenant());
create policy discounts_write on public.discounts for all
  using (
    public.my_role() = 'super_admin'
    or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant())
  )
  with check (
    public.my_role() = 'super_admin'
    or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant())
  );

-- Discount applied to an order line (snapshot name/% so history is stable).
alter table public.order_items
  add column if not exists discount_id uuid references public.discounts(id) on delete set null,
  add column if not exists discount_name text,
  add column if not exists discount_percent numeric(5,2) not null default 0;

-- Apply (or clear, p_discount_id = null) a discount on one order line.
create or replace function public.staff_set_item_discount(
  p_order_item_id uuid,
  p_discount_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_tenant uuid;
  v_disc public.discounts%rowtype;
  v_name text := null;
  v_percent numeric(5,2) := 0;
  v_line numeric(10,2);
  v_subtotal numeric(10,2);
  v_staff_name text;
begin
  select * into v_item from public.order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from public.orders where id = v_item.order_id;
  if not public.can_access_branch(v_order.branch_id) then
    raise exception 'Not allowed to change this order';
  end if;
  if v_order.order_status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled orders cannot be changed';
  end if;

  select tenant_id into v_tenant from public.branches where id = v_order.branch_id;

  if p_discount_id is not null then
    select * into v_disc from public.discounts
     where id = p_discount_id and tenant_id = v_tenant and is_active;
    if not found then raise exception 'Invalid or inactive discount'; end if;
    v_name := v_disc.name;
    v_percent := v_disc.percent;
  end if;

  v_line := round(v_item.unit_price * v_item.quantity * (1 - v_percent / 100.0), 2);
  update public.order_items
     set discount_id = p_discount_id,
         discount_name = v_name,
         discount_percent = v_percent,
         subtotal = v_line
   where id = p_order_item_id;

  -- Recompute the order; a changed total voids any prior payment.
  select coalesce(sum(subtotal), 0) into v_subtotal
    from public.order_items where order_id = v_order.id;
  update public.orders
     set subtotal = v_subtotal,
         total = v_subtotal,
         payment_status = case when payment_status = 'paid' then 'unpaid' else payment_status end,
         amount_paid = case when payment_status = 'paid' then null else amount_paid end,
         change_due = case when payment_status = 'paid' then null else change_due end,
         paid_at = case when payment_status = 'paid' then null else paid_at end
   where id = v_order.id;

  select name into v_staff_name from public.staff where id = auth.uid();
  perform public.log_activity(
    v_tenant, v_order.branch_id, auth.uid(), coalesce(v_staff_name, 'Staff'),
    'order_edited',
    jsonb_build_object('order_number', v_order.order_number, 'total', v_subtotal)
  );

  return jsonb_build_object('total', v_subtotal);
end $$;

grant execute on function public.staff_set_item_discount(uuid, uuid) to authenticated;

-- track_order includes per-item discount info.
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
           'discount_name', discount_name,
           'discount_percent', discount_percent,
           'notes', notes)), '[]'::jsonb)
    into v_items
    from public.order_items where order_id = v_order.id;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'order_status', v_order.order_status,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'order_type', v_order.order_type,
    'table_number', v_table_number,
    'subtotal', v_order.subtotal,
    'total', v_order.total,
    'created_at', v_order.created_at,
    'items', v_items
  );
end $$;
