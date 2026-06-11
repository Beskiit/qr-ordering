-- ============================================================
-- Show sold-out items on the customer menu — run AFTER 007.
--
-- Previously anonymous customers could only SELECT available
-- products (sold-out items vanished from the menu). Now the menu
-- shows them greyed-out as "Sold out" instead, so the policy
-- opens product reads to everyone. Ordering a sold-out item is
-- still blocked server-side inside place_order().
-- ============================================================

drop policy products_select on public.products;
create policy products_select on public.products for select using (true);
