import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${slug}/login`);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) redirect("/");

  const { data: staff } = await supabase
    .from("staff")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const allowed =
    staff?.is_active &&
    (staff.role === "super_admin" || staff.tenant_id === tenant.id);
  if (!allowed) redirect(`/${slug}/login`);

  const { data: branches } = await supabase
    .from("branches")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at");

  return (
    <DashboardShell staff={staff} branches={branches ?? []}>
      {children}
    </DashboardShell>
  );
}
