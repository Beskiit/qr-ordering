import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Super-admin only: create a tenant together with its first
 * tenant-admin login account.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { data: caller } = await supabase
    .from("staff")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (caller?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { name, slug, plan, brand_color, adminName, adminEmail, adminPassword } = body;

  if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase letters, numbers and dashes only." },
      { status: 400 }
    );
  }
  if (adminPassword.length < 8) {
    return NextResponse.json(
      { error: "Admin password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Create the tenant
  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      name,
      slug,
      plan: plan || "free",
      brand_color: brand_color || "#e11d48",
    })
    .select()
    .single();
  if (tenantErr) {
    return NextResponse.json({ error: tenantErr.message }, { status: 400 });
  }

  // 2. Create a default branch so they can start immediately
  const { data: branch } = await admin
    .from("branches")
    .insert({ tenant_id: tenant.id, name: "Main Branch", slug: "main" })
    .select()
    .single();

  // 3. Create the tenant-admin auth user (staff row added by DB trigger)
  const { error: userErr } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: {
      name: adminName,
      role: "tenant_admin",
      tenant_id: tenant.id,
      branch_id: branch?.id ?? "",
    },
  });
  if (userErr) {
    // Roll back the tenant so we don't leave a half-created account.
    await admin.from("tenants").delete().eq("id", tenant.id);
    return NextResponse.json({ error: userErr.message }, { status: 400 });
  }

  return NextResponse.json({ id: tenant.id, slug: tenant.slug });
}
