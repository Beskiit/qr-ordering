"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner, EmptyState, ErrorNote, Avatar } from "@/components/ui";
import { Tenant } from "@/lib/types";

export default function SuperAdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    plan: "free",
    brand_color: "#e11d48",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    setTenants(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/admin/login");
        return;
      }
      const { data: staff } = await supabase
        .from("staff")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (staff?.role !== "super_admin") {
        router.replace("/admin/login");
        return;
      }
      setAuthorized(true);
      load();
    })();
  }, [supabase, router, load]);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) return setError(json.error ?? "Failed to create tenant.");
    setCreating(false);
    setForm({
      name: "",
      slug: "",
      plan: "free",
      brand_color: "#e11d48",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    });
    load();
  }

  async function toggleActive(t: Tenant) {
    const action = t.is_active ? "Suspend" : "Restore";
    if (!confirm(`${action} "${t.name}"?`)) return;
    await supabase.from("tenants").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  async function setPlan(t: Tenant, plan: string) {
    await supabase.from("tenants").update({ plan }).eq("id", t.id);
    load();
  }

  async function remove(t: Tenant) {
    if (!confirm(`PERMANENTLY delete "${t.name}" and ALL its data? This cannot be undone.`))
      return;
    const { error: err } = await supabase.from("tenants").delete().eq("id", t.id);
    if (err) return setError(err.message);
    load();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  if (authorized === null || loading) return <Spinner label="Loading…" />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛡️</span>
          <h1 className="font-bold">Super Admin — Tenants</h1>
        </div>
        <button
          onClick={signOut}
          className="text-sm rounded-lg border border-gray-600 px-3 py-1.5 hover:bg-gray-800"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-4xl mx-auto p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {tenants.length} tenant{tenants.length !== 1 ? "s" : ""} on the platform
          </p>
          <button onClick={() => setCreating(true)} className="btn-brand text-sm">
            + Onboard new tenant
          </button>
        </div>

        <ErrorNote message={error} />

        {tenants.length === 0 ? (
          <EmptyState icon="🏢" text="No tenants yet. Onboard your first restaurant!" />
        ) : (
          <div className="flex flex-col gap-3">
            {tenants.map((t) => (
              <div key={t.id} className="card p-4 flex items-center gap-4">
                <Avatar url={t.logo_url} name={t.name} size={44} />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${!t.is_active ? "text-gray-400" : ""}`}>
                    {t.name}
                    {!t.is_active && (
                      <span className="ml-2 text-xs rounded-full bg-red-100 text-red-600 px-2 py-0.5">
                        Suspended
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    <Link
                      href={`/${t.slug}/menu`}
                      className="underline hover:text-gray-700"
                      target="_blank"
                    >
                      /{t.slug}
                    </Link>{" "}
                    · since {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className="h-5 w-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: t.brand_color }}
                  title={`Brand color ${t.brand_color}`}
                />
                <select
                  className="input !w-auto text-xs"
                  value={t.plan}
                  onChange={(e) => setPlan(t, e.target.value)}
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
                <button
                  onClick={() => toggleActive(t)}
                  className={`text-xs rounded-full px-2.5 py-1 font-semibold ${
                    t.is_active
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {t.is_active ? "Suspend" : "Restore"}
                </button>
                <button onClick={() => remove(t)} className="text-sm text-red-400 px-1">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {creating && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setCreating(false)}
        >
          <form
            onSubmit={createTenant}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-bold text-lg">Onboard a new tenant</h3>

            <p className="text-xs font-semibold text-gray-400 uppercase mt-1">Business</p>
            <input
              className="input"
              placeholder="Restaurant name (e.g. Pizza Palace)"
              required
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                })
              }
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">yourapp.com/</span>
              <input
                className="input flex-1"
                placeholder="url-slug"
                required
                pattern="[a-z0-9][a-z0-9-]*"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div className="flex gap-3 items-center">
              <select
                className="input"
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
              >
                <option value="free">Free plan</option>
                <option value="pro">Pro plan</option>
                <option value="enterprise">Enterprise plan</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-500 whitespace-nowrap">
                Brand
                <input
                  type="color"
                  value={form.brand_color}
                  onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-200"
                />
              </label>
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase mt-2">
              Tenant admin account
            </p>
            <input
              className="input"
              placeholder="Admin full name"
              required
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
            />
            <input
              className="input"
              type="email"
              placeholder="Admin email"
              required
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            />
            <input
              className="input"
              type="password"
              placeholder="Admin password (min. 8 chars)"
              required
              minLength={8}
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            />

            <ErrorNote message={error} />

            <div className="flex gap-2 mt-1">
              <button type="submit" disabled={saving} className="btn-brand flex-1">
                {saving ? "Creating…" : "Create tenant"}
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
