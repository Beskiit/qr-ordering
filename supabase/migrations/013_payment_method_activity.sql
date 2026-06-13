-- ============================================================
-- Include the payment method in the activity log. Run AFTER 012.
-- When staff settle a payment, the log now records HOW it was paid
-- (counter / gcash / maya / bank) alongside the cash/change.
-- ============================================================

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
                         'method', new.payment_method,
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
