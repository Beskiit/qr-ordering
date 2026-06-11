<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project context

## What this project is

A **multi-tenant QR-code restaurant ordering SaaS** — Next.js 16 (App Router, `src/` dir,
Tailwind v4) + Supabase (Postgres, Auth, Storage, Realtime). It is a full conversion of the
Laravel API in the sibling folder `../qr-ordering-api` (kept for reference; this app replaces
it and adds the frontend).

Flow: customer scans a table QR → `/{tenant}/menu?t={qr_token}` → branded menu → cart →
`place_order` RPC → live tracking at `/{tenant}/track/{orderNumber}`. Staff manage orders in
a realtime dashboard.

## Architecture decisions (agreed with the owner — don't change casually)

- **Path-based tenancy**: `/{tenant-slug}/...`, NOT subdomains. The `[tenant]` layout
  (`src/app/[tenant]/layout.tsx`) looks up the tenant by slug and injects `--brand` /
  `--brand-dark` CSS variables — this is how **per-tenant branding** works. All UI uses
  `var(--brand)` (see `.btn-brand`, `.bg-brand` etc. in `globals.css`).
- **Per-tenant branding is a core feature**: tenants set `brand_color`, `brand_color_dark`,
  `logo_url` (Settings page, `dashboard/settings`). Staff have `avatar_url`. Uploads go to
  the public `branding` storage bucket; product photos to `product-images`.
- **Security lives in Postgres RLS**, not app code (`supabase/migrations/001_schema.sql`).
  Helper functions `my_role()`, `my_tenant()`, `can_manage_branch()`, `can_access_branch()`
  are SECURITY DEFINER to avoid policy recursion.
- **Customers are anonymous**: they never read/write `orders` directly. They use the
  `place_order(p_qr_token, p_items, p_customer_name)` RPC (prices computed server-side from
  the DB — never trust client prices) and `track_order(p_order_number)` RPC.
- **Roles**: `super_admin` (tenant_id null) > `tenant_admin` > `branch_admin` > `branch_staff`,
  stored on `public.staff` (id = auth.users.id, auto-created by `handle_new_user` trigger
  from user_metadata). Creating/deleting auth users requires the service-role key → only via
  `src/app/api/staff/route.ts` and `src/app/api/tenants/route.ts`, which verify the caller's
  role first.
- **Realtime**: `orders` is in the `supabase_realtime` publication; the orders board
  (`dashboard/page.tsx`) subscribes per-branch. Customer tracking polls the RPC instead
  (anon can't receive RLS-gated realtime events).
- Next.js 16: use `proxy.ts` (not `middleware.ts`); route `params` are Promises (`await params`).
- ESLint: `react-hooks/set-state-in-effect` and `@next/next/no-img-element` are intentionally
  off (fetch-on-mount pattern; images come from Supabase Storage URLs).

## Schema (all UUID pks, see supabase/migrations/)

tenants → branches → {categories → products, tables, staff} ; orders (branch_id, table_id)
→ order_items (snapshots product_name/unit_price at order time). Order statuses:
pending → confirmed → preparing → ready → completed (or cancelled). Currency formatting is
PHP pesos (₱) via `formatMoney` in `src/lib/types.ts`.

## Key paths

- `src/lib/supabase/{client,server,admin}.ts` — browser / SSR / service-role clients
- `src/lib/tenant-context.tsx`, `src/lib/dashboard-context.tsx` — tenant + staff/branch state
- `src/app/[tenant]/menu` — customer menu (cart, place order)
- `src/app/[tenant]/dashboard/**` — orders, menu, tables (QR via `qrcode` pkg, client-side),
  branches, staff, settings (branding + profile)
- `src/app/admin` — super admin (tenant onboarding)

## Setup / commands

- Env: `.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`). SQL must be run in the Supabase SQL
  editor: `001_schema.sql` then `002_seed.sql` (creates Demo Cafe at `/demo-cafe/menu`).
- Super admin bootstrap: create auth user in dashboard, then
  `update staff set role='super_admin', tenant_id=null where email='...'`.
- `npm run dev` / `npm run build` / `npm run lint` — keep build and lint clean.
