-- ============================================================
-- POS payment capture — run AFTER 001_schema.sql
-- Adds cash-tendered / change tracking to orders so staff can
-- settle payments like a point-of-sale, and a composite index
-- for the sales analytics page.
-- ============================================================

alter table public.orders
  add column if not exists amount_paid numeric(10,2)
    check (amount_paid is null or amount_paid >= 0),
  add column if not exists change_due numeric(10,2)
    check (change_due is null or change_due >= 0),
  add column if not exists paid_at timestamptz;

-- Sales page queries orders by branch + date range.
create index if not exists idx_orders_branch_created
  on public.orders(branch_id, created_at desc);
