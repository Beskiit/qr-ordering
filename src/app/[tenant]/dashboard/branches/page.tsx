"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState, ErrorNote } from "@/components/ui";
import { Branch } from "@/lib/types";

export default function BranchesPage() {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const { staff } = useDashboard();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const [saving, setSaving] = useState(false);

  const isAllowed = staff.role === "tenant_admin" || staff.role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("branches")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at");
    setBranches(data ?? []);
    setLoading(false);
  }, [supabase, tenant.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);

    const slug =
      editing.slug ||
      editing.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
      "";

    const payload = {
      tenant_id: tenant.id,
      name: editing.name,
      slug,
      address: editing.address || null,
      phone: editing.phone || null,
    };

    const { error: err } = editing.id
      ? await supabase.from("branches").update(payload).eq("id", editing.id)
      : await supabase.from("branches").insert(payload);

    setSaving(false);
    if (err) return setError(err.message);
    setEditing(null);
    load();
  }

  async function toggleActive(b: Branch) {
    await supabase.from("branches").update({ is_active: !b.is_active }).eq("id", b.id);
    load();
  }

  async function remove(b: Branch) {
    if (!confirm(`Delete branch "${b.name}"? All its menu, tables and orders will be removed.`))
      return;
    const { error: err } = await supabase.from("branches").delete().eq("id", b.id);
    if (err) return setError(err.message);
    load();
  }

  if (!isAllowed)
    return <EmptyState icon="🔒" text="Only the tenant admin can manage branches." />;
  if (loading) return <Spinner label="Loading branches…" />;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">Branches</h2>
        <button onClick={() => setEditing({})} className="btn-brand text-sm">
          + New branch
        </button>
      </div>

      <ErrorNote message={error} />

      {branches.length === 0 ? (
        <EmptyState icon="🏪" text="No branches yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {branches.map((b) => (
            <div key={b.id} className="card p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className={`font-semibold ${!b.is_active ? "text-gray-400" : ""}`}>
                  {b.name}{" "}
                  <span className="text-xs font-normal text-gray-400">/{b.slug}</span>
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {[b.address, b.phone].filter(Boolean).join(" · ") || "No details"}
                </p>
              </div>
              <button
                onClick={() => toggleActive(b)}
                className={`text-xs rounded-full px-2.5 py-1 font-semibold ${
                  b.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {b.is_active ? "Active" : "Inactive"}
              </button>
              <button
                onClick={() => setEditing(b)}
                className="text-sm text-gray-500 hover:text-gray-800 px-2"
              >
                Edit
              </button>
              <button onClick={() => remove(b)} className="text-sm text-red-400 px-1">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setEditing(null)}
        >
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-3"
          >
            <h3 className="font-bold text-lg">{editing.id ? "Edit branch" : "New branch"}</h3>
            <input
              className="input"
              placeholder="Branch name (e.g. Makati Branch)"
              required
              value={editing.name ?? ""}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Address (optional)"
              value={editing.address ?? ""}
              onChange={(e) => setEditing({ ...editing, address: e.target.value })}
            />
            <input
              className="input"
              placeholder="Phone (optional)"
              value={editing.phone ?? ""}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
            />
            <ErrorNote message={error} />
            <div className="flex gap-2 mt-1">
              <button type="submit" disabled={saving} className="btn-brand flex-1">
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
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
