-- ============================================================
-- Optional per-category color. Run AFTER 016.
-- NULL = use the default card styling. When set, product cards for
-- that category get a colored accent. Covered by the existing
-- categories RLS policies (no policy changes needed).
-- ============================================================

alter table public.categories
  add column if not exists color text;
