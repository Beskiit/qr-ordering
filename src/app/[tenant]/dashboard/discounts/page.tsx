"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState, ErrorNote } from "@/components/ui";
import { useConfirm, useToast } from "@/components/feedback";
import { Lock, Tag } from "lucide-react";
import { Discount } from "@/lib/types";

export default function DiscountsPage() {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const { staff } = useDashboard();
  const confirm = useConfirm();
  const toast = useToast();

  const isAllowed =
    staff.role === "tenant_admin" || staff.role === "super_admin";

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("discounts")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at");
    setDiscounts((data as Discount[]) ?? []);
    setLoading(false);
  }, [supabase, tenant.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addDiscount(e: React.FormEvent) {
    e.preventDefault();
    const pct = parseFloat(percent);
    if (!name.trim() || isNaN(pct) || pct <= 0 || pct > 100) {
      setError("Enter a name and a percentage between 0 and 100.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("discounts").insert({
      tenant_id: tenant.id,
      name: name.trim(),
      percent: pct,
    });
    setSaving(false);
    if (err) return setError(err.message);
    setName("");
    setPercent("");
    toast("Discount added");
    load();
  }

  async function toggleActive(d: Discount) {
    await supabase
      .from("discounts")
      .update({ is_active: !d.is_active })
      .eq("id", d.id);
    load();
  }

  async function remove(d: Discount) {
    const ok = await confirm({
      title: `Delete "${d.name}"?`,
      message: "Past orders keep their recorded discount; it just can't be applied to new ones.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const { error: err } = await supabase.from("discounts").delete().eq("id", d.id);
    if (err) return setError(err.message);
    toast(`"${d.name}" deleted`);
    load();
  }

  if (!isAllowed)
    return (
      <EmptyState
        icon={<Lock className="h-10 w-10" />}
        text="Only the tenant admin can manage discounts."
      />
    );
  if (loading) return <Spinner label="Loading discounts…" />;

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="font-bold text-lg">Discounts</h2>
        <p className="text-sm text-gray-500">
          Define discounts staff can apply to individual items in an order.
        </p>
      </div>

      <form onSubmit={addDiscount} className="card p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Discount name (e.g. Senior / PWD)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="relative w-28">
            <input
              className="input pr-7"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="20"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              %
            </span>
          </div>
          <button disabled={saving} className="btn-brand whitespace-nowrap">
            {saving ? "Adding…" : "+ Add"}
          </button>
        </div>
        <ErrorNote message={error} />
      </form>

      {discounts.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-10 w-10" />}
          text="No discounts yet. Add one above."
        />
      ) : (
        <div className="card p-2">
          <div className="flex flex-col divide-y divide-gray-100">
            {discounts.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${!d.is_active ? "text-gray-400" : ""}`}>
                    {d.name}
                  </p>
                  <p className="text-xs text-gray-500">{Number(d.percent)}% off</p>
                </div>
                <button
                  onClick={() => toggleActive(d)}
                  className={`text-xs rounded-full px-2.5 py-1 font-semibold ${
                    d.is_active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {d.is_active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => remove(d)}
                  className="text-sm text-red-400 px-1"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
