-- ============================================================
-- Demo seed data — run AFTER 001_schema.sql
-- Creates a demo tenant "Demo Cafe" with a branch, menu and tables.
--
-- NOTE: staff/admin accounts are created through the app (or the
-- Supabase Auth dashboard) because they need real auth users.
-- See README for how to bootstrap your SUPER ADMIN account.
-- ============================================================

-- Tenant (with branding)
insert into public.tenants (id, name, slug, brand_color, brand_color_dark, plan) values
  ('11111111-1111-1111-1111-111111111111', 'Demo Cafe', 'demo-cafe', '#e11d48', '#1f2937', 'pro');

-- Branch
insert into public.branches (id, tenant_id, name, slug, address, phone) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Main Branch', 'main', '123 Coffee St, Manila', '+63 912 345 6789');

-- Categories
insert into public.categories (id, branch_id, name, description, display_order) values
  ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222222', 'Coffee',  'Hot and iced espresso drinks', 1),
  ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', 'Pastries','Freshly baked every morning',  2),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Meals',   'Rice meals and sandwiches',    3);

-- Products
insert into public.products (branch_id, category_id, name, description, price, display_order) values
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333331', 'Americano',        'Double shot, hot or iced',        120.00, 1),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333331', 'Cafe Latte',       'Espresso with steamed milk',      150.00, 2),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333331', 'Spanish Latte',    'Sweetened condensed milk latte',  165.00, 3),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333332', 'Butter Croissant', 'Flaky and golden',                 95.00, 1),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333332', 'Chocolate Muffin', 'Rich double chocolate',           110.00, 2),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Chicken Adobo Rice Bowl', 'Classic adobo over garlic rice', 220.00, 1),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Clubhouse Sandwich',      'Triple decker with fries',       195.00, 2);

-- Tables (qr_token auto-generates)
insert into public.tables (branch_id, table_number, capacity) values
  ('22222222-2222-2222-2222-222222222222', 'T1', 2),
  ('22222222-2222-2222-2222-222222222222', 'T2', 4),
  ('22222222-2222-2222-2222-222222222222', 'T3', 4),
  ('22222222-2222-2222-2222-222222222222', 'T4', 6);
