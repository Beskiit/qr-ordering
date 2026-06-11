-- ============================================================
-- Ending float — run AFTER 004_cash_counts.sql
-- "Left in drawer for tomorrow": recorded at closing, used to
-- pre-fill the next day's starting float automatically.
-- ============================================================

alter table public.cash_counts
  add column if not exists left_in_drawer numeric(10,2)
    check (left_in_drawer is null or left_in_drawer >= 0);
