"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState } from "@/components/ui";
import { Drawer } from "@/components/drawer";
import { OrderDetailView } from "@/components/order-detail";
import { ReceiptText } from "lucide-react";
import { formatMoney, orderDestination, Order, OrderItem } from "@/lib/types";

type OrderRow = Order & {
  order_items: OrderItem[];
  tables: { table_number: string } | null;
};

export default function ReceiptsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { branchId } = useDashboard();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrderRow | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*), tables(table_number)")
      .eq("branch_id", branchId)
      .eq("order_status", "completed")
      .order("created_at", { ascending: false })
      .limit(200);
    setOrders((data as OrderRow[]) ?? []);
    setLoading(false);
  }, [supabase, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const query = search.trim().toLowerCase();
  const visible = query
    ? orders.filter((o) =>
        `${o.order_number} ${o.customer_name ?? ""}`
          .toLowerCase()
          .includes(query)
      )
    : orders;

  if (loading) return <Spinner label="Loading receipts…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-lg">
          Receipts{" "}
          <span className="text-sm font-normal text-gray-400">
            (completed orders)
          </span>
        </h2>
        <input
          className="input !w-auto"
          placeholder="Search order # or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-10 w-10" />}
          text={
            query
              ? "No receipts match your search."
              : "No completed orders yet. They'll appear here once an order is completed."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o)}
              className="card p-4 text-left hover:shadow-md transition flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">{o.order_number}</p>
                <span className="font-bold text-brand">
                  {formatMoney(o.total)}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {orderDestination(o.order_type, o.tables?.table_number ?? null)}
                {o.customer_name ? ` · ${o.customer_name}` : ""}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(o.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {o.payment_status === "paid" ? " · ✓ Paid" : " · Unpaid"}
              </p>
            </button>
          ))}
        </div>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Receipt"
      >
        {selected && (
          <OrderDetailView
            order={{
              ...selected,
              tableNumber: selected.tables?.table_number ?? null,
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
