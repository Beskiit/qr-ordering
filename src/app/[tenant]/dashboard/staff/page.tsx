"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState, ErrorNote, Avatar } from "@/components/ui";
import { Staff } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Tenant admin",
  branch_admin: "Branch admin",
  branch_staff: "Branch staff",
};

export default function StaffPage() {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const { staff: me, branches } = useDashboard();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "branch_staff",
    branch_id: "",
  });

  const isAllowed = me.role === "tenant_admin" || me.role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("staff")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at");
    setStaffList(data ?? []);
    setLoading(false);
  }, [supabase, tenant.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, tenant_id: tenant.id }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) return setError(json.error ?? "Failed to create staff.");
    setCreating(false);
    setForm({ name: "", email: "", password: "", role: "branch_staff", branch_id: "" });
    load();
  }

  async function toggleActive(s: Staff) {
    await supabase.from("staff").update({ is_active: !s.is_active }).eq("id", s.id);
    load();
  }

  async function remove(s: Staff) {
    if (!confirm(`Remove ${s.name}'s account? They will no longer be able to sign in.`)) return;
    const res = await fetch(`/api/staff?id=${s.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Failed to delete.");
    load();
  }

  if (!isAllowed)
    return <EmptyState icon="🔒" text="Only the tenant admin can manage staff." />;
  if (loading) return <Spinner label="Loading staff…" />;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">Staff</h2>
        <button onClick={() => setCreating(true)} className="btn-brand text-sm">
          + Add staff member
        </button>
      </div>

      <ErrorNote message={error} />

      {staffList.length === 0 ? (
        <EmptyState icon="👥" text="No staff yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {staffList.map((s) => (
            <div key={s.id} className="card p-4 flex items-center gap-3">
              <Avatar url={s.avatar_url} name={s.name} size={40} />
              <div className="flex-1 min-w-0">
                <p className={`font-semibold ${!s.is_active ? "text-gray-400" : ""}`}>
                  {s.name} {s.id === me.id && <span className="text-xs text-gray-400">(you)</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {s.email} · {ROLE_LABELS[s.role] ?? s.role}
                  {s.branch_id &&
                    ` · ${branches.find((b) => b.id === s.branch_id)?.name ?? ""}`}
                </p>
              </div>
              {s.id !== me.id && (
                <>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`text-xs rounded-full px-2.5 py-1 font-semibold ${
                      s.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s.is_active ? "Active" : "Disabled"}
                  </button>
                  <button onClick={() => remove(s)} className="text-sm text-red-400 px-1">
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setCreating(false)}
        >
          <form
            onSubmit={createStaff}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-3"
          >
            <h3 className="font-bold text-lg">Add staff member</h3>
            <input
              className="input"
              placeholder="Full name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="input"
              type="email"
              placeholder="Email (they sign in with this)"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="input"
              type="password"
              placeholder="Password (min. 8 characters)"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="branch_staff">Branch staff (orders only)</option>
              <option value="branch_admin">Branch admin (menu + tables)</option>
              <option value="tenant_admin">Tenant admin (everything)</option>
            </select>
            {form.role !== "tenant_admin" && (
              <select
                className="input"
                required
                value={form.branch_id}
                onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
              >
                <option value="">Assign to branch…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <ErrorNote message={error} />
            <div className="flex gap-2 mt-1">
              <button type="submit" disabled={saving} className="btn-brand flex-1">
                {saving ? "Creating…" : "Create account"}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-[0.625rem] border border-gray-300 px-4 font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
