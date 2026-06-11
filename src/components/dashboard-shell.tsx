"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { DashboardProvider, useDashboard } from "@/lib/dashboard-context";
import { Avatar } from "@/components/ui";
import type { Branch, Staff } from "@/lib/types";

const NAV = [
  { href: "", label: "Orders", icon: "🧾", roles: ["super_admin", "tenant_admin", "branch_admin", "branch_staff"] },
  { href: "/sales", label: "Sales", icon: "📊", roles: ["super_admin", "tenant_admin", "branch_admin"] },
  { href: "/drawer", label: "Cash drawer", icon: "💵", roles: ["super_admin", "tenant_admin", "branch_admin", "branch_staff"] },
  { href: "/activity", label: "Activity", icon: "📜", roles: ["super_admin", "tenant_admin", "branch_admin"] },
  { href: "/menu", label: "Menu", icon: "🍔", roles: ["super_admin", "tenant_admin", "branch_admin"] },
  { href: "/tables", label: "Tables & QR", icon: "🪑", roles: ["super_admin", "tenant_admin", "branch_admin"] },
  { href: "/branches", label: "Branches", icon: "🏪", roles: ["super_admin", "tenant_admin"] },
  { href: "/staff", label: "Staff", icon: "👥", roles: ["super_admin", "tenant_admin"] },
  { href: "/settings", label: "Settings", icon: "⚙️", roles: ["super_admin", "tenant_admin", "branch_admin", "branch_staff"] },
];

function Shell({ children }: { children: React.ReactNode }) {
  const tenant = useTenant();
  const { staff, branches, branchId, setBranchId } = useDashboard();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const base = `/${tenant.slug}/dashboard`;
  const canSwitchBranch =
    staff.role === "tenant_admin" || staff.role === "super_admin";

  async function signOut() {
    // Audit trail: must insert BEFORE signOut destroys the session.
    await supabase.from("activity_logs").insert({
      tenant_id: tenant.id,
      branch_id: staff.branch_id,
      actor_id: staff.id,
      actor_name: staff.name,
      action: "staff_signed_out",
    });
    await supabase.auth.signOut();
    router.push(`/${tenant.slug}/login`);
    router.refresh();
  }

  return (
    <div className="flex-1 flex flex-col sm:flex-row min-h-screen">
      {/* Sidebar */}
      <aside className="sm:w-60 shrink-0 bg-white border-b sm:border-b-0 sm:border-r border-gray-200 flex sm:flex-col">
        <div className="hidden sm:flex items-center gap-2.5 px-4 py-4 border-b border-gray-100">
          <Avatar url={tenant.logo_url} name={tenant.name} size={36} />
          <div className="min-w-0">
            <p className="font-bold text-sm truncate text-[var(--brand-dark)]">
              {tenant.name}
            </p>
            <p className="text-[11px] text-gray-400 capitalize">{tenant.plan} plan</p>
          </div>
        </div>

        <nav className="flex sm:flex-col flex-1 overflow-x-auto sm:overflow-visible px-2 py-2 gap-1">
          {NAV.filter((n) => n.roles.includes(staff.role)).map((n) => {
            const href = `${base}${n.href}`;
            const active =
              n.href === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={n.href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-brand text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span>{n.icon}</span> {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden sm:block px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2.5">
            <Avatar url={staff.avatar_url} name={staff.name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{staff.name}</p>
              <p className="text-[11px] text-gray-400 capitalize">
                {staff.role.replace("_", " ")}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-3 w-full rounded-lg border border-gray-200 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between gap-3">
          <h1 className="font-bold text-[var(--brand-dark)]">Dashboard</h1>
          {canSwitchBranch && branches.length > 0 && (
            <select
              className="input !w-auto text-sm"
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </header>
        <main className="flex-1 p-5 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardShell({
  staff,
  branches,
  children,
}: {
  staff: Staff;
  branches: Branch[];
  children: React.ReactNode;
}) {
  return (
    <DashboardProvider staff={staff} branches={branches}>
      <Shell>{children}</Shell>
    </DashboardProvider>
  );
}
