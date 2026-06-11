"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, StatusBadge, EmptyState } from "@/components/ui";
import { formatMoney, Order, OrderItem, OrderStatus } from "@/lib/types";

type OrderRow = Order & {
  order_items: OrderItem[];
  tables: { table_number: string } | null;
};

const NEXT_ACTION: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
  pending: ["confirmed", "Confirm"],
  confirmed: ["preparing", "Start preparing"],
  preparing: ["ready", "Mark ready"],
  ready: ["completed", "Complete"],
};

export default function OrdersBoard() {
  const supabase = useMemo(() => createClient(), []);
  const { branchId } = useDashboard();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all">("active");

  const fetchOrders = useCallback(async () => {
    if (!branchId) return;
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*), tables(table_number)")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(100);
    setOrders((data as OrderRow[]) ?? []);
    setLoading(false);
  }, [supabase, branchId]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
    if (!branchId) return;

    // Live updates: refetch whenever an order in this branch changes.
    const channel = supabase
      .channel(`orders-${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branchId}`,
        },
        () => fetchOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, branchId, fetchOrders]);

  async function setStatus(order: OrderRow, status: OrderStatus) {
    await supabase
      .from("orders")
      .update({
        order_status: status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", order.id);
    fetchOrders();
  }

  async function togglePaid(order: OrderRow) {
    await supabase
      .from("orders")
      .update({
        payment_status: order.payment_status === "paid" ? "unpaid" : "paid",
      })
      .eq("id", order.id);
    fetchOrders();
  }

  const visible = orders.filter((o) =>
    filter === "active"
      ? !["completed", "cancelled"].includes(o.order_status)
      : true
  );

  if (loading) return <Spinner label="Loading orders…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">
          Orders{" "}
          <span className="text-sm font-normal text-gray-400">
            (live · updates automatically)
          </span>
        </h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(["active", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 capitalize ${
                filter === f ? "bg-brand text-white" : "bg-white text-gray-600"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="🧾" text="No orders yet. They'll appear here the moment a customer orders." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => {
            const action = NEXT_ACTION[o.order_status];
            return (
              <div key={o.id} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{o.order_number}</p>
                    <p className="text-xs text-gray-500">
                      Table {o.tables?.table_number ?? "—"}
                      {o.customer_name ? ` · ${o.customer_name}` : ""} ·{" "}
                      {new Date(o.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <StatusBadge status={o.order_status} />
                </div>

                <div className="text-sm flex flex-col gap-1 border-y border-gray-100 py-2">
                  {o.order_items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span>
                        {item.quantity}× {item.product_name}
                        {item.notes && (
                          <span className="block text-xs text-amber-600">
                            📝 {item.notes}
                          </span>
                        )}
                      </span>
                      <span className="text-gray-500">
                        {formatMoney(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-brand">
                    {formatMoney(o.total)}
                  </span>
                  <button
                    onClick={() => togglePaid(o)}
                    className={`text-xs rounded-full px-2.5 py-1 font-semibold ${
                      o.payment_status === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {o.payment_status === "paid" ? "✓ Paid" : "Mark paid"}
                  </button>
                </div>

                <div className="flex gap-2">
                  {action && (
                    <button
                      onClick={() => setStatus(o, action[0])}
                      className="btn-brand flex-1 py-2 text-sm"
                    >
                      {action[1]}
                    </button>
                  )}
                  {!["completed", "cancelled"].includes(o.order_status) && (
                    <button
                      onClick={() => setStatus(o, "cancelled")}
                      className="rounded-[0.625rem] border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
