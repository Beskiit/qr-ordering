-- ============================================================
-- QR Ordering SaaS — Supabase schema
-- Run this in the Supabase SQL Editor (or `supabase db push`)
-- ============================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- TENANTS (restaurant businesses) — includes per-tenant branding
-- ────────────────────────────────────────────────────────────
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,                 -- used in URLs: /{slug}/menu
  logo_url      text,                                 -- tenant logo (Supabase Storage)
  brand_color   text not null default '#e11d48',      -- primary brand color
  brand_color_dark text not null default '#1f2937',   -- secondary/heading color
  plan          text not null default 'free' check (plan in ('free','pro','enterprise')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- BRANCHES (locations of a tenant)
-- ────────────────────────────────────────────────────────────
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  slug        text not null,
  address     text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- ────────────────────────────────────────────────────────────
-- STAFF — linked 1:1 to Supabase Auth users (id = auth.users.id)
-- Roles: super_admin (tenant_id null) | tenant_admin | branch_admin | branch_staff
-- ────────────────────────────────────────────────────────────
create table public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  branch_id   uuid references public.branches(id) on delete set null,
  name        text not null,
  email       text not null,
  role        text not null default 'branch_staff'
              check (role in ('super_admin','tenant_admin','branch_admin','branch_staff')),
  avatar_url  text,                                   -- profile picture (Supabase Storage)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- MENU: categories, products, product images
-- ────────────────────────────────────────────────────────────
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches(id) on delete cascade,
  name          text not null,
  description   text,
  display_order int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric(10,2) not null check (price >= 0),
  image_url     text,                                 -- primary product photo
  is_available  boolean not null default true,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- TABLES (physical tables; each gets a QR token)
-- ────────────────────────────────────────────────────────────
create table public.tables (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches(id) on delete cascade,
  table_number  text not null,
  qr_token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  capacity      int not null default 4,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- ORDERS + ORDER ITEMS
-- ────────────────────────────────────────────────────────────
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches(id) on delete cascade,
  table_id       uuid not null references public.tables(id) on delete cascade,
  order_number   text not null unique,
  order_status   text not null default 'pending'
                 check (order_status in ('pending','confirmed','preparing','ready','completed','cancelled')),
  customer_name  text,
  subtotal       numeric(10,2) not null,
  tax            numeric(10,2) not null default 0,
  total          numeric(10,2) not null,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  product_name text not null,                          -- snapshot at order time
  unit_price   numeric(10,2) not null,                 -- snapshot at order time
  quantity     int not null check (quantity > 0),
  subtotal     numeric(10,2) not null,
  notes        text,
  created_at   timestamptz not null default now()
);

create index idx_branches_tenant   on public.branches(tenant_id);
create index idx_staff_tenant      on public.staff(tenant_id);
create index idx_categories_branch on public.categories(branch_id);
create index idx_products_branch   on public.products(branch_id);
create index idx_products_category on public.products(category_id);
create index idx_tables_branch     on public.tables(branch_id);
create index idx_orders_branch     on public.orders(branch_id);
create index idx_order_items_order on public.order_items(order_id);

-- ────────────────────────────────────────────────────────────
-- updated_at trigger
-- ────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tenants','branches','staff','categories','products','tables','orders']
  loop
    execute format('create trigger trg_%s_updated before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────
-- Auto-create a staff profile when an auth user is created.
-- Role/tenant/branch come from user_metadata set at creation time.
-- ────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff (id, name, email, role, tenant_id, branch_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'branch_staff'),
    nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'branch_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- RLS helper functions (security definer → no policy recursion)
-- ────────────────────────────────────────────────────────────
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as
$$ select role from public.staff where id = auth.uid() and is_active $$;

create or replace function public.my_tenant()
returns uuid language sql stable security definer set search_path = public as
$$ select tenant_id from public.staff where id = auth.uid() and is_active $$;

create or replace function public.my_branch()
returns uuid language sql stable security definer set search_path = public as
$$ select branch_id from public.staff where id = auth.uid() and is_active $$;

-- Can the current staff member MANAGE this branch (menu, tables)?
create or replace function public.can_manage_branch(b uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r text := public.my_role();
begin
  if r = 'super_admin' then return true; end if;
  if r = 'tenant_admin' then
    return exists (select 1 from public.branches where id = b and tenant_id = public.my_tenant());
  end if;
  if r = 'branch_admin' then return b = public.my_branch(); end if;
  return false;
end $$;

-- Can the current staff member ACCESS this branch (view/update orders)?
create or replace function public.can_access_branch(b uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r text := public.my_role();
begin
  if r = 'super_admin' then return true; end if;
  if r = 'tenant_admin' then
    return exists (select 1 from public.branches where id = b and tenant_id = public.my_tenant());
  end if;
  if r in ('branch_admin','branch_staff') then return b = public.my_branch(); end if;
  return false;
end $$;

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
alter table public.tenants      enable row level security;
alter table public.branches     enable row level security;
alter table public.staff        enable row level security;
alter table public.categories   enable row level security;
alter table public.products     enable row level security;
alter table public.tables       enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;

-- TENANTS: public can read active tenants (needed for branded menu);
-- own staff can read their tenant; super admin everything.
create policy tenants_select on public.tenants for select
  using (is_active or public.my_role() = 'super_admin' or id = public.my_tenant());
create policy tenants_insert on public.tenants for insert
  with check (public.my_role() = 'super_admin');
create policy tenants_update on public.tenants for update
  using (public.my_role() = 'super_admin'
         or (public.my_role() = 'tenant_admin' and id = public.my_tenant()));
create policy tenants_delete on public.tenants for delete
  using (public.my_role() = 'super_admin');

-- BRANCHES: public read active; tenant staff read all theirs; tenant admin writes.
create policy branches_select on public.branches for select
  using (is_active or public.can_access_branch(id));
create policy branches_write on public.branches for all
  using (public.my_role() = 'super_admin'
         or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant()))
  with check (public.my_role() = 'super_admin'
         or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant()));

-- STAFF: read self; admins read their tenant's staff; self-update profile.
create policy staff_select on public.staff for select
  using (id = auth.uid()
         or public.my_role() = 'super_admin'
         or (public.my_role() in ('tenant_admin','branch_admin') and tenant_id = public.my_tenant()));
create policy staff_update on public.staff for update
  using (id = auth.uid()
         or public.my_role() = 'super_admin'
         or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant()));
create policy staff_delete on public.staff for delete
  using (public.my_role() = 'super_admin'
         or (public.my_role() = 'tenant_admin' and tenant_id = public.my_tenant()));

-- CATEGORIES / PRODUCTS: public read (menu); branch managers write.
create policy categories_select on public.categories for select
  using (is_active or public.can_access_branch(branch_id));
create policy categories_write on public.categories for all
  using (public.can_manage_branch(branch_id))
  with check (public.can_manage_branch(branch_id));

create policy products_select on public.products for select
  using (is_available or public.can_access_branch(branch_id));
create policy products_write on public.products for all
  using (public.can_manage_branch(branch_id))
  with check (public.can_manage_branch(branch_id));

-- TABLES: public read active (QR token → table resolution); managers write.
create policy tables_select on public.tables for select
  using (is_active or public.can_access_branch(branch_id));
create policy tables_write on public.tables for all
  using (public.can_manage_branch(branch_id))
  with check (public.can_manage_branch(branch_id));

-- ORDERS: staff of the branch/tenant read + update status.
-- Customers create/track orders via SECURITY DEFINER RPCs below (no anon table access).
create policy orders_select on public.orders for select
  using (public.can_access_branch(branch_id));
create policy orders_update on public.orders for update
  using (public.can_access_branch(branch_id));

create policy order_items_select on public.order_items for select
  using (exists (select 1 from public.orders o
                 where o.id = order_id and public.can_access_branch(o.branch_id)));

-- ────────────────────────────────────────────────────────────
-- RPC: place_order — anonymous customers place an order via QR token.
-- Prices are taken from the DB (never trusted from the client).
-- ────────────────────────────────────────────────────────────
create or replace function public.place_order(
  p_qr_token text,
  p_items jsonb,                 -- [{ "product_id": uuid, "quantity": int, "notes": text }]
  p_customer_name text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table   public.tables%rowtype;
  v_order_id uuid;
  v_order_no text;
  v_subtotal numeric(10,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty int;
  v_line numeric(10,2);
begin
  select * into v_table from public.tables
   where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid or inactive table QR code';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  v_order_no := 'ORD-' || to_char(now(), 'YYMMDD') || '-' ||
                upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (branch_id, table_id, order_number, customer_name, subtotal, tax, total)
  values (v_table.branch_id, v_table.id, v_order_no, p_customer_name, 0, 0, 0)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid
       and branch_id = v_table.branch_id
       and is_available;
    if not found then
      raise exception 'Product % is not available', v_item->>'product_id';
    end if;

    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_line := round(v_product.price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_qty, v_line,
            nullif(v_item->>'notes', ''));
  end loop;

  update public.orders
     set subtotal = v_subtotal, tax = 0, total = v_subtotal
   where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'total', v_subtotal);
end $$;

-- ────────────────────────────────────────────────────────────
-- RPC: track_order — customers check status with their order number.
-- ────────────────────────────────────────────────────────────
create or replace function public.track_order(p_order_number text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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

grant execute on function public.place_order(text, jsonb, text) to anon, authenticated;
grant execute on function public.track_order(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- Realtime: stream order changes to staff dashboards
-- ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.orders;

-- ────────────────────────────────────────────────────────────
-- STORAGE: buckets for tenant branding (logos/avatars) + product photos
-- ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('branding', 'branding', true),
  ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy storage_public_read on storage.objects for select
  using (bucket_id in ('branding', 'product-images'));
create policy storage_staff_insert on storage.objects for insert
  with check (bucket_id in ('branding', 'product-images') and auth.role() = 'authenticated');
create policy storage_staff_update on storage.objects for update
  using (bucket_id in ('branding', 'product-images') and auth.role() = 'authenticated');
create policy storage_staff_delete on storage.objects for delete
  using (bucket_id in ('branding', 'product-images') and auth.role() = 'authenticated');
