-- ============================================================
-- Let orders be CREATED/EDITED with per-item discounts already applied.
-- Run AFTER 018. add_order_items now reads an optional discount_id on
-- each item, validates it against the branch's tenant, and prices the
-- line accordingly. (place_order for customers simply never sends one.)
-- ============================================================

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
  v_tenant uuid;
  v_disc public.discounts%rowtype;
  v_disc_id uuid;
  v_disc_name text;
  v_disc_pct numeric(5,2);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  select tenant_id into v_tenant from public.branches where id = p_branch_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid
       and branch_id = p_branch_id
       and is_available;
    if not found then
      raise exception 'Product % is not available', v_item->>'product_id';
    end if;

    -- size / variant
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

    -- add-ons
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

    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    -- optional per-item discount (ignored if missing/inactive)
    v_disc_id := nullif(v_item->>'discount_id', '')::uuid;
    v_disc_name := null;
    v_disc_pct := 0;
    if v_disc_id is not null then
      select * into v_disc from public.discounts
       where id = v_disc_id and tenant_id = v_tenant and is_active;
      if found then
        v_disc_name := v_disc.name;
        v_disc_pct := v_disc.percent;
      else
        v_disc_id := null;
      end if;
    end if;

    v_line := round(v_unit * v_qty * (1 - v_disc_pct / 100.0), 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.order_items
      (order_id, product_id, product_name, variant_name, addons, unit_price,
       quantity, subtotal, discount_id, discount_name, discount_percent, notes)
    values
      (p_order_id, v_product.id, v_product.name, v_variant_name, v_addons, v_unit,
       v_qty, v_line, v_disc_id, v_disc_name, v_disc_pct, nullif(v_item->>'notes', ''));
  end loop;

  return v_subtotal;
end $$;
