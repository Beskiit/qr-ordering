-- ============================================================
-- Let staff edit an order's items while it's still active. Run AFTER 014.
--   • staff_update_order_items: replaces the items of an unpaid,
--     not-yet-completed order and re-prices server-side.
--   • Logged to activity as 'order_edited' (who + new total).
-- ============================================================

alter table public.activity_logs drop constraint activity_logs_action_check;
alter table public.activity_logs add constraint activity_logs_action_check
  check (action in (
    'order_placed','order_status_changed',
    'payment_settled','payment_undone',
    'staff_signed_in','staff_signed_out',
    'drawer_closed','cash_in','cash_out','order_edited'
  ));

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
  if v_order.payment_status = 'paid' then
    raise exception 'Undo the payment before editing this order';
  end if;

  -- Replace items and re-price from the DB (never trust client prices).
  delete from public.order_items where order_id = p_order_id;
  v_subtotal := public.add_order_items(p_order_id, v_order.branch_id, p_items);
  update public.orders set subtotal = v_subtotal, tax = 0, total = v_subtotal
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

grant execute on function public.staff_update_order_items(uuid, jsonb) to authenticated;
