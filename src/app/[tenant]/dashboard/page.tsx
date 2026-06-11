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
  // POS: order being settled + cash received input
  const [settling, setSettling] = useState<OrderRow | null>(null);
  const [tendered, setTendered] = useState("");

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

  const tenderedNum = parseFloat(tendered) || 0;
  const change = settling ? tenderedNum - settling.total : 0;

  // Keypad / keyboard input: digits, one decimal point, max 2 decimals.
  const appendKey = useCallback((key: string) => {
    setTendered((prev) => {
      if (key === "back") return prev.slice(0, -1);
      if (key === ".") {
        if (prev.includes(".")) return prev;
        return prev === "" ? "0." : prev + ".";
      }
      const candidate = prev === "0" ? key : prev + key;
      const [whole, dec] = candidate.split(".");
      if (whole.length > 6 || (dec?.length ?? 0) > 2) return prev;
      return candidate;
    });
  }, []);

  const confirmPayment = useCallback(async () => {
    if (!settling || tenderedNum < settling.total) return;
    await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        amount_paid: tenderedNum,
        change_due: Math.round(change * 100) / 100,
        paid_at: new Date().toISOString(),
      })
      .eq("id", settling.id);
    setSettling(null);
    setTendered("");
    fetchOrders();
  }, [settling, tenderedNum, change, supabase, fetchOrders]);

  // Physical keyboard works too while the dialog is open (desktop POS):
  // digits / "." type, Backspace deletes, Enter confirms, Escape closes.
  useEffect(() => {
    if (!settling) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) appendKey(e.key);
      else if (e.key === "." || e.key === ",") appendKey(".");
      else if (e.key === "Backspace") appendKey("back");
      else if (e.key === "Enter") confirmPayment();
      else if (e.key === "Escape") setSettling(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settling, appendKey, confirmPayment]);

  async function markUnpaid(order: OrderRow) {
    if (!confirm(`Undo payment for ${order.order_number}?`)) return;
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
                      onClick={() => {
                        setSettling(o);
                        setTendered("");
                      }}
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

      {/* POS payment dialog */}
      {settling && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setSettling(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4"
          >
            <div>
              <h3 className="font-bold text-lg">Take payment</h3>
              <p className="text-sm text-gray-500">
                {settling.order_number} · Table{" "}
                {settling.tables?.table_number ?? "—"}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-xs text-gray-500">Amount due</p>
              <p className="text-3xl font-bold text-brand">
                {formatMoney(settling.total)}
              </p>
            </div>

            <div>
              {/* Amount display — no <input>, so the tablet's on-screen
                  keyboard never pops up. Physical keyboards still type
                  via the global key listener. */}
              <div className="flex items-baseline justify-between rounded-xl border-2 border-brand px-4 py-3">
                <span className="text-sm text-gray-500">Cash received</span>
                <span
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    tendered === "" ? "text-gray-300" : ""
                  }`}
                >
                  {tendered === "" ? "0.00" : tendered}
                </span>
              </div>

              {/* Quick bills */}
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setTendered(String(settling.total))}
                  className="text-xs rounded-full border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-50"
                >
                  Exact
                </button>
                {[100, 200, 500, 1000]
                  .filter((bill) => bill >= settling.total)
                  .map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      onClick={() => setTendered(String(bill))}
                      className="text-xs rounded-full border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-50"
                    >
                      ₱{bill}
                    </button>
                  ))}
              </div>

              {/* POS keypad */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map(
                  (k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => appendKey(k)}
                      className="rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 py-3 text-xl font-semibold select-none"
                    >
                      {k === "back" ? "⌫" : k}
                    </button>
                  )
                )}
              </div>
            </div>

            <div
              className={`rounded-xl p-4 text-center ${
                tendered === ""
                  ? "bg-gray-50"
                  : change < 0
                  ? "bg-red-50"
                  : "bg-emerald-50"
              }`}
            >
              <p className="text-xs text-gray-500">Change</p>
              <p
                className={`text-2xl font-bold ${
                  tendered === ""
                    ? "text-gray-300"
                    : change < 0
                    ? "text-red-500"
                    : "text-emerald-600"
                }`}
              >
                {tendered === ""
                  ? "—"
                  : change < 0
                  ? `${formatMoney(Math.abs(change))} short`
                  : formatMoney(change)}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={confirmPayment}
                disabled={tenderedNum < settling.total}
                className="btn-brand flex-1 py-3 disabled:opacity-40"
              >
                Confirm payment
              </button>
              <button
                onClick={() => setSettling(null)}
                className="rounded-[0.625rem] border border-gray-300 px-4 font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
