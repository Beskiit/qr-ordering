# QR Ordering — Next.js + Supabase

A multi-tenant QR-code restaurant ordering SaaS, converted from the original Laravel API
(`qr-ordering-api`) into a full-stack **Next.js (App Router) + Supabase** application —
backend *and* frontend.

Each restaurant (tenant) gets its own branded storefront: **their own brand colors and
logo**, applied across the customer menu, order tracking, and staff dashboard. Staff
members can also upload their own **profile pictures**.

## How it works

| Who | URL | What they can do |
|---|---|---|
| **Customer** | `/{tenant}/menu?t={qr-token}` | Scan the table QR → branded menu → cart → place order → live tracking. No login. |
| **Branch staff** | `/{tenant}/dashboard` | Live order board (updates in real time), advance order status, mark paid. |
| **Branch admin** | + Menu, Tables & QR | Manage categories/products (with photo upload), create tables — QR PNG generated instantly. |
| **Tenant admin** | + Branches, Staff, Settings | Manage branches & staff accounts, and **edit branding** (color picker + logo upload with live preview). |
| **Super admin** | `/admin` | Onboard tenants (with their first admin account), change plans, suspend/restore/delete. |

Tenant isolation is enforced by **Postgres Row Level Security** — not just app code.
Customers never get direct write access to orders; they go through the `place_order`
RPC, which prices items server-side.

## Setup (about 10 minutes)

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine).
2. Wait for it to provision.

### 2. Run the database migrations
1. In your Supabase dashboard, open **SQL Editor**.
2. Paste and run [`supabase/migrations/001_schema.sql`](supabase/migrations/001_schema.sql)
   (tables, RLS policies, RPCs, storage buckets, realtime).
3. Then run [`supabase/migrations/002_seed.sql`](supabase/migrations/002_seed.sql)
   (demo tenant **Demo Cafe** with menu and tables).

### 3. Configure environment variables
```bash
cp .env.example .env.local
```
Fill in from **Project Settings → API**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only — used to create staff login accounts)

### 4. Bootstrap your super admin
1. Supabase dashboard → **Authentication → Users → Add user** (email + password,
   check "Auto confirm user").
2. SQL Editor → promote it:
   ```sql
   update public.staff
      set role = 'super_admin', tenant_id = null, branch_id = null
    where email = 'you@example.com';
   ```

### 5. Run
```bash
npm install
npm run dev
```

- Landing page: <http://localhost:3000>
- Demo menu (browse mode): <http://localhost:3000/demo-cafe/menu>
- Super admin: <http://localhost:3000/admin/login>

To place a demo order you need a table's QR token: sign in as super admin → or run
`select table_number, qr_token from tables;` in the SQL editor, then open
`/demo-cafe/menu?t=<qr_token>`. (Normally customers get this by scanning the printed QR.)

### 6. Create your first real tenant
1. Sign in at `/admin/login`.
2. **Onboard new tenant** — set name, URL slug, plan, brand color, and the tenant
   admin's login. A default "Main Branch" is created automatically.
3. The tenant admin signs in at `/{slug}/login` and can immediately:
   - upload their **logo** and pick **brand colors** (Dashboard → Settings),
   - build the menu and upload product photos,
   - add tables and download/print the QR codes,
   - add staff accounts.

## Project structure

```
supabase/migrations/    SQL: schema, RLS, RPCs, storage, seed
src/
  middleware.ts         Supabase session refresh
  lib/
    supabase/           browser / server / service-role clients
    types.ts            shared domain types
    tenant-context.tsx  current tenant (branding) provider
    dashboard-context.tsx staff + branch-switcher state
  components/           ui primitives, dashboard shell
  app/
    page.tsx            landing page
    admin/              super admin (login + tenant management)
    api/
      tenants/          POST: create tenant + admin (service role)
      staff/            POST/DELETE: manage staff accounts (service role)
    [tenant]/           ← everything below is tenant-branded
      menu/             customer menu + cart + place order
      track/[orderNo]/  live order tracking
      login/            staff sign-in
      dashboard/        orders (realtime) · menu · tables/QR ·
                        branches · staff · settings (branding + profile)
```

## Mapping from the Laravel version

| Laravel | Here |
|---|---|
| Sanctum guards + `role:` middleware | Supabase Auth + RLS policies + `staff.role` |
| `ResolveTenant` subdomain middleware | `/[tenant]` path segment + layout lookup |
| Controllers | Direct Supabase queries under RLS + 2 service-role API routes |
| QR generation job | Client-side `qrcode` PNG (token stored in DB) |
| — (new) | Realtime order board, per-tenant branding, logo/avatar uploads |
