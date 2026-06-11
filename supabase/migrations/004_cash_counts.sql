-- ============================================================
-- Cash drawer reconciliation (end-of-day closings)
-- Run AFTER 003_pos_payments.sql.
--
-- Each row is one drawer count: expected cash (from paid orders)
-- vs what staff actually counted, with the variance. Rows are
-- immutable history — no update/delete policies on purpose.
-- ============================================================

create table public.cash_counts (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches(id) on delete cascade,
  staff_id       uuid references public.staff(id) on delete set null,
  staff_name     text not null,                       -- snapshot at close time
  business_date  date not null,
  starting_float numeric(10,2) not null default 0,    -- change fund at day start
  expected_cash  numeric(10,2) not null,              -- cash sales captured at close
  counted_cash   numeric(10,2) not null,
  variance       numeric(10,2) not null,              -- counted - (float + expected)
  notes          text,
  created_at     timestamptz not null default now()
);

create index idx_cash_counts_branch
  on public.cash_counts(branch_id, business_date desc);

alter table public.cash_counts enable row level security;

create policy cash_counts_select on public.cash_counts for select
  using (public.can_access_branch(branch_id));
create policy cash_counts_insert on public.cash_counts for insert
  with check (public.can_access_branch(branch_id));
