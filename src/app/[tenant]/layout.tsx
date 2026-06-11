import { createClient } from "@/lib/supabase/server";
import { TenantProvider } from "@/lib/tenant-context";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant: slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  return { title: data ? `${data.name} — QR Ordering` : "QR Ordering" };
}

export default async function TenantLayout({ children, params }: Props) {
  const { tenant: slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!tenant) notFound();

  // Per-tenant branding: inject the tenant's colors as CSS variables.
  // Everything below (menu, dashboard, buttons) picks them up automatically.
  return (
    <div
      className="min-h-screen flex flex-col flex-1"
      style={
        {
          "--brand": tenant.brand_color,
          "--brand-dark": tenant.brand_color_dark,
        } as React.CSSProperties
      }
    >
      <TenantProvider tenant={tenant}>{children}</TenantProvider>
    </div>
  );
}
