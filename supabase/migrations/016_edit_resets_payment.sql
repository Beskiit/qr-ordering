-- ============================================================
-- Editing an order is allowed while it isn't completed/cancelled —
-- including PAID orders. When the items are changed, the order is
-- reset to UNPAID so staff re-collect the new total (the app only
-- calls this when something actually changed; an unchanged save
-- never reaches here, so a paid order stays paid). Run AFTER 015.
-- ============================================================

create or replace function public.staff_update_order_items(
  p_order_id uuid,
  p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_subtotal numeric(10,2);
  v_tenant uuid;
  v_staff_name text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if not public.can_access_branch(v_order.branch_id) then
    raise exception 'Not allowed to edit orders for this branch';
  end if;
  if v_order.order_status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled orders cannot be edited';
  end if;

  -- Replace items and re-price from the DB (never trust client prices).
  delete from public.order_items where order_id = p_order_id;
  v_subtotal := public.add_order_items(p_order_id, v_order.branch_id, p_items);

  -- Changing the order voids any prior payment — back to unpaid so the
  -- new total is collected. (The paid→unpaid transition is itself logged
  -- by the order activity trigger.)
  update public.orders
     set subtotal = v_subtotal,
         tax = 0,
         total = v_subtotal,
         payment_status = 'unpaid',
         amount_paid = null,
         change_due = null,
         paid_at = null
   where id = p_order_id;

  select tenant_id into v_tenant from public.branches where id = v_order.branch_id;
  select name into v_staff_name from public.staff where id = auth.uid();
  perform public.log_activity(
    v_tenant, v_order.branch_id, auth.uid(), coalesce(v_staff_name, 'Staff'),
    'order_edited',
    jsonb_build_object('order_number', v_order.order_number, 'total', v_subtotal)
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'total', v_subtotal
  );
end $$;
