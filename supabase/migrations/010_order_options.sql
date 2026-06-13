-- ============================================================
-- Orders with sizes/add-ons + staff-created (walk-in) orders.
-- Run AFTER 009.
--   • order_items snapshots the chosen size + add-ons
--   • orders.table_id becomes nullable (walk-in / counter orders)
--   • place_order rewritten to price sizes + add-ons server-side
--   • new staff_create_order RPC for dashboard order entry
--   • order_placed activity now attributes staff-created orders
-- ============================================================

-- 1. order_items: snapshot the size name + add-ons at order time.
alter table public.order_items
  add column if not exists variant_name text,
  add column if not exists addons jsonb not null default '[]'::jsonb;

-- 2. Walk-in orders have no table. Keep history if a table is deleted.
alter table public.orders drop constraint orders_table_id_fkey;
alter table public.orders alter column table_id drop not null;
alter table public.orders add constraint orders_table_id_fkey
  foreign key (table_id) references public.tables(id) on delete set null;

-- 3. Shared pricing engine — validates products/sizes/add-ons against
--    the branch and computes prices from the DB (never the client).
create or replace function public.add_order_items(
  p_order_id uuid, p_branch_id uuid, p_items jsonb
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_subtotal numeric(10,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_variant_name text;
  v_addons jsonb;
  v_addon_total numeric(10,2);
  v_unit numeric(10,2);
  v_qty int;
  v_line numeric(10,2);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid
       and branch_id = p_branch_id
       and is_available;
    if not found then
      raise exception 'Product % is not available', v_item->>'product_id';
    end if;

    -- size / variant (optional, but if given must belong to the product)
    v_variant_name := null;
    v_unit := v_product.price;
    if nullif(v_item->>'variant_id', '') is not null then
      select * into v_variant from public.product_variants
       where id = (v_item->>'variant_id')::uuid and product_id = v_product.id;
      if not found then
        raise exception 'Invalid size for product %', v_product.name;
      end if;
      v_unit := v_variant.price;
      v_variant_name := v_variant.name;
    end if;

    -- add-ons (optional, zero or more, must belong to the product)
    select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'price', a.price)
                               order by a.display_order), '[]'::jsonb),
           coalesce(sum(a.price), 0)
      into v_addons, v_addon_total
      from public.product_addons a
     where a.product_id = v_product.id
       and a.id in (
         select t.val::uuid
         from jsonb_array_elements_text(coalesce(v_item->'addon_ids', '[]'::jsonb)) as t(val)
       );

    v_unit := v_unit + v_addon_total;
    v_qty  := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_line := round(v_unit * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.order_items
      (order_id, product_id, product_name, variant_name, addons, unit_price, quantity, subtotal, notes)
    values
      (p_order_id, v_product.id, v_product.name, v_variant_name, v_addons, v_unit, v_qty, v_line,
       nullif(v_item->>'notes', ''));
  end loop;

  return v_subtotal;
end $$;

-- 4. place_order (customer, via QR token) — now options-aware.
create or replace function public.place_order(
  p_qr_token text,
  p_items jsonb,                 -- [{product_id, quantity, notes, variant_id?, addon_ids?[]}]
  p_customer_name text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_table public.tables%rowtype;
  v_order_id uuid;
  v_order_no text;
  v_subtotal numeric(10,2);
begin
  select * into v_table from public.tables where qr_token = p_qr_token and is_active;
  if not found then raise exception 'Invalid or inactive table QR code'; end if;

  v_order_no := 'ORD-' || to_char(now(), 'YYMMDD') || '-' ||
                upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (branch_id, table_id, order_number, customer_name, subtotal, tax, total)
  values (v_table.branch_id, v_table.id, v_order_no, p_customer_name, 0, 0, 0)
  returning id into v_order_id;

  v_subtotal := public.add_order_items(v_order_id, v_table.branch_id, p_items);

  update public.orders set subtotal = v_subtotal, tax = 0, total = v_subtotal where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_subtotal);
end $$;

-- 5. staff_create_order — dashboard order entry (walk-in / counter).
--    table_id may be null. Caller must be able to access the branch.
create or replace function public.staff_create_order(
  p_branch_id uuid,
  p_table_id uuid,
  p_items jsonb,
  p_customer_name text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_order_no text;
  v_subtotal numeric(10,2);
begin
  if not public.can_access_branch(p_branch_id) then
    raise exception 'Not allowed to create orders for this branch';
  end if;
  if p_table_id is not null and not exists (
    select 1 from public.tables where id = p_table_id and branch_id = p_branch_id
  ) then
    raise exception 'Invalid table for this branch';
  end if;

  v_order_no := 'ORD-' || to_char(now(), 'YYMMDD') || '-' ||
                upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (branch_id, table_id, order_number, customer_name, subtotal, tax, total)
  values (p_branch_id, p_table_id, v_order_no, p_customer_name, 0, 0, 0)
  returning id into v_order_id;

  v_subtotal := public.add_order_items(v_order_id, p_branch_id, p_items);

  update public.orders set subtotal = v_subtotal, tax = 0, total = v_subtotal where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_subtotal);
end $$;

grant execute on function public.staff_create_order(uuid, uuid, jsonb, text) to authenticated;

-- 6. track_order — include size + add-ons in the receipt.
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
    'table_number', v_table_number,
    'subtotal', v_order.subtotal,
    'total', v_order.total,
    'created_at', v_order.created_at,
    'items', v_items
  );
end $$;

-- 7. Attribute staff-created orders in the activity log. Customer (anon)
--    orders have no auth.uid(), so they still log as the customer name.
create or replace function public.log_order_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_staff_name text;
begin
  select tenant_id into v_tenant from public.branches where id = new.branch_id;
  select name into v_staff_name from public.staff where id = auth.uid();

  if tg_op = 'INSERT' then
    perform public.log_activity(
      v_tenant, new.branch_id, auth.uid(),
      coalesce(v_staff_name, nullif(new.customer_name, ''), 'Customer'),
      'order_placed',
      jsonb_build_object('order_number', new.order_number, 'total', new.total)
    );
    return new;
  end if;

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
