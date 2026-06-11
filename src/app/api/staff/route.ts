import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Staff account management. Creating/deleting auth users requires the
 * service-role key, so it happens here on the server — guarded by the
 * caller's own session and role.
 */
async function getCaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: staff } = await supabase
    .from("staff")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return staff;
}

export async function POST(request: NextRequest) {
  const caller = await getCaller();
  if (!caller || !["tenant_admin", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { name, email, password, role, branch_id, tenant_id } = body;

  if (!name || !email || !password || !password.trim() || password.length < 8) {
    return NextResponse.json(
      { error: "Name, email and a password of at least 8 characters are required." },
      { status: 400 }
    );
  }
  if (!["tenant_admin", "branch_admin", "branch_staff"].includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  // Tenant admins can only create staff inside their own tenant.
  const targetTenant =
    caller.role === "super_admin" ? tenant_id : caller.tenant_id;
  if (!targetTenant) {
    return NextResponse.json({ error: "Missing tenant." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      role,
      tenant_id: targetTenant,
      branch_id: branch_id || "",
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.user.id });
}

export async function DELETE(request: NextRequest) {
  const caller = await getCaller();
  if (!caller || !["tenant_admin", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  if (id === caller.id) {
    return NextResponse.json({ error: "You cannot delete yourself." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the target belongs to the caller's tenant (unless super admin).
  const { data: target } = await admin
    .from("staff")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (caller.role !== "super_admin" && target.tenant_id !== caller.tenant_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
