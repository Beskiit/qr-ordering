-- ============================================================
-- Customer-chosen payment method on each order. Run AFTER 011.
--   • orders.payment_method: how the customer intends to pay
--     ('counter' is the default — pay cash to staff).
--   • set_order_payment: lets the anonymous customer record their
--     choice from the order tracking page (only while unpaid).
--   • track_order returns it so the page can preselect.
-- This is the INTENDED method; payment_status (paid/unpaid) is still
-- set by staff when they confirm the money was received.
-- ============================================================

alter table public.orders
  add column if not exists payment_method text not null default 'counter'
    check (payment_method in ('counter', 'gcash', 'maya', 'bank'));

create or replace function public.set_order_payment(
  p_order_number text,
  p_method text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_method not in ('counter', 'gcash', 'maya', 'bank') then
    raise exception 'Invalid payment method';
  end if;
  update public.orders
     set payment_method = p_method
   where order_number = p_order_number
     and payment_status = 'unpaid';
end $$;

grant execute on function public.set_order_payment(text, text) to anon, authenticated;

-- track_order returns the chosen method too.
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
    'payment_method', v_order.payment_method,
    'order_type', v_order.order_type,
    'table_number', v_table_number,
    'subtotal', v_order.subtotal,
    'total', v_order.total,
    'created_at', v_order.created_at,
    'items', v_items
  );
end $$;
