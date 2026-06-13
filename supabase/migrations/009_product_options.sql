-- ============================================================
-- Product sizes (variants) + add-ons — run AFTER 008.
--
-- Both are OPTIONAL per product: a product with no variants just
-- uses its base price; a product with no add-ons offers none.
-- A store that doesn't use add-ons simply never creates any.
--
--  • variant = a size choice (Small/Medium/Large); customer picks ONE.
--    Its price is the ABSOLUTE price for that size.
--  • add-on  = an optional extra (extra shot, oat milk); customer picks
--    ZERO OR MORE. Its price is ADDED to the line.
-- branch_id is denormalized onto both for easy querying + simple RLS.
-- ============================================================

create table public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  branch_id     uuid not null references public.branches(id) on delete cascade,
  name          text not null,
  price         numeric(10,2) not null check (price >= 0),
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

create table public.product_addons (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  branch_id     uuid not null references public.branches(id) on delete cascade,
  name          text not null,
  price         numeric(10,2) not null default 0 check (price >= 0),
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_variants_product on public.product_variants(product_id);
create index idx_addons_product   on public.product_addons(product_id);

alter table public.product_variants enable row level security;
alter table public.product_addons   enable row level security;

-- Customers (anon) must be able to read these to build the menu.
create policy variants_select on public.product_variants for select using (true);
create policy variants_write  on public.product_variants for all
  using (public.can_manage_branch(branch_id))
  with check (public.can_manage_branch(branch_id));

create policy addons_select on public.product_addons for select using (true);
create policy addons_write  on public.product_addons for all
  using (public.can_manage_branch(branch_id))
  with check (public.can_manage_branch(branch_id));
