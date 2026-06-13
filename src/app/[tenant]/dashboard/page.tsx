"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, StatusBadge, EmptyState } from "@/components/ui";
import { PaymentDialog } from "@/components/payment-dialog";
import { Drawer } from "@/components/drawer";
import { OrderDetailView } from "@/components/order-detail";
import { useConfirm } from "@/components/feedback";
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
  const tenant = useTenant();
  const { branchId } = useDashboard();
  const confirm = useConfirm();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<OrderRow | null>(null);
  const [selected, setSelected] = useState<OrderRow | null>(null);

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

  async function markUnpaid(order: OrderRow) {
    const ok = await confirm({
      title: `Undo payment for ${order.order_number}?`,
      message: "This marks the order unpaid and clears the recorded cash and change.",
      confirmLabel: "Undo payment",
      tone: "danger",
    });
    if (!ok) return;
    await supabase
      .from("orders")
      .update({
        payment_status: "unpaid",
        amount_paid: null,
        change_due: null,
        paid_at: null,
      })
      .eq("id", order.id);
    fetchOrders();
  }

  // Live board shows active orders only; completed ones live in Receipts.
  const visible = orders.filter(
    (o) => !["completed", "cancelled"].includes(o.order_status)
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
        <Link
          href={`/${tenant.slug}/dashboard/new-order`}
          className="btn-brand text-sm whitespace-nowrap"
        >
          + New order
        </Link>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="🧾" text="No orders yet. They'll appear here the moment a customer orders." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => {
            const action = NEXT_ACTION[o.order_status];
            return (
              <div
                key={o.id}
                onClick={() => setSelected(o)}
                className="card p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{o.order_number}</p>
                    <p className="text-xs text-gray-500">
                      {o.tables?.table_number
                        ? `Table ${o.tables.table_number}`
                        : "Walk-in"}
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
                        {item.variant_name ? ` · ${item.variant_name}` : ""}
                        {item.addons?.length > 0 && (
                          <span className="block text-xs text-gray-400">
                            + {item.addons.map((a) => a.name).join(", ")}
                          </span>
                        )}
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

                <div
                  className="flex items-center justify-between"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="font-bold text-brand">
                    {formatMoney(o.total)}
                  </span>
                  {o.payment_status === "paid" ? (
                    <button
                      onClick={() => markUnpaid(o)}
                      title="Tap to undo payment"
                      className="text-xs rounded-full px-2.5 py-1 font-semibold bg-emerald-100 text-emerald-700"
                    >
                      ✓ Paid
                    </button>
                  ) : (
                    <button
                      onClick={() => setSettling(o)}
                      className="text-xs rounded-full px-2.5 py-1 font-semibold bg-brand text-white"
                    >
                      💵 Take payment
                    </button>
                  )}
                </div>

                {o.payment_status === "paid" && o.amount_paid != null && (
                  <p className="text-xs text-gray-500 -mt-1">
                    Cash {formatMoney(o.amount_paid)} · Change{" "}
                    {formatMoney(o.change_due ?? 0)}
                  </p>
                )}

                <div
                  className="flex gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
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

      {settling && (
        <PaymentDialog
          orderId={settling.id}
          orderNumber={settling.order_number}
          tableLabel={
            settling.tables?.table_number
              ? `Table ${settling.tables.table_number}`
              : "Walk-in"
          }
          total={settling.total}
          onClose={() => setSettling(null)}
          onPaid={() => {
            setSettling(null);
            fetchOrders();
          }}
        />
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Order details"
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
