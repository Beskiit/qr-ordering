"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { useTenant } from "@/lib/tenant-context";
import { Spinner, EmptyState, ErrorNote } from "@/components/ui";
import { DiningTable } from "@/lib/types";

export default function TablesPage() {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const { branchId } = useDashboard();

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTable, setNewTable] = useState({ table_number: "", capacity: 4 });

  const menuUrl = useCallback(
    (token: string) => {
      const base =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL;
      return `${base}/${tenant.slug}/menu?t=${token}`;
    },
    [tenant.slug]
  );

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tables")
      .select("*")
      .eq("branch_id", branchId)
      .order("table_number");
    const rows = data ?? [];
    setTables(rows);

    // Generate QR images client-side — no storage round-trip needed.
    const images: Record<string, string> = {};
    await Promise.all(
      rows.map(async (t) => {
        images[t.id] = await QRCode.toDataURL(menuUrl(t.qr_token), {
          width: 360,
          margin: 1,
        });
      })
    );
    setQrImages(images);
    setLoading(false);
  }, [supabase, branchId, menuUrl]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newTable.table_number.trim() || !branchId) return;
    const { error: err } = await supabase.from("tables").insert({
      branch_id: branchId,
      table_number: newTable.table_number.trim(),
      capacity: newTable.capacity,
    });
    if (err) return setError(err.message);
    setNewTable({ table_number: "", capacity: 4 });
    load();
  }

  async function deleteTable(t: DiningTable) {
    if (!confirm(`Delete table ${t.table_number}? Its QR code will stop working.`)) return;
    const { error: err } = await supabase.from("tables").delete().eq("id", t.id);
    if (err) return setError(err.message);
    load();
  }

  function downloadQR(t: DiningTable) {
    const a = document.createElement("a");
    a.href = qrImages[t.id];
    a.download = `${tenant.slug}-table-${t.table_number}-qr.png`;
    a.click();
  }

  if (loading) return <Spinner label="Loading tables…" />;

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <ErrorNote message={error} />

      <form onSubmit={addTable} className="card p-4 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-40">
          <label className="text-xs font-medium text-gray-500">Table number / name</label>
          <input
            className="input mt-1"
            placeholder="e.g. T5 or Patio 2"
            value={newTable.table_number}
            onChange={(e) => setNewTable({ ...newTable, table_number: e.target.value })}
          />
        </div>
        <div className="w-28">
          <label className="text-xs font-medium text-gray-500">Seats</label>
          <input
            className="input mt-1"
            type="number"
            min={1}
            value={newTable.capacity}
            onChange={(e) => setNewTable({ ...newTable, capacity: Number(e.target.value) })}
          />
        </div>
        <button className="btn-brand">+ Add table</button>
      </form>

      {tables.length === 0 ? (
        <EmptyState icon="🪑" text="No tables yet. Add one — its QR code generates instantly." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((t) => (
            <div key={t.id} className="card p-4 flex flex-col items-center text-center">
              <h3 className="font-bold">Table {t.table_number}</h3>
              <p className="text-xs text-gray-400">{t.capacity} seats</p>
              {qrImages[t.id] && (
                <img
                  src={qrImages[t.id]}
                  alt={`QR for table ${t.table_number}`}
                  className="mt-3 w-44 h-44 rounded-lg border border-gray-100"
                />
              )}
              <p className="mt-2 text-[10px] text-gray-400 break-all px-2">
                {menuUrl(t.qr_token)}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => downloadQR(t)} className="btn-brand text-xs px-3 py-1.5">
                  ⬇ Download PNG
                </button>
                <button
                  onClick={() => deleteTable(t)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
