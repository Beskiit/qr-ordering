"use client";

import { StatusBadge } from "@/components/ui";
import { formatMoney, OrderItem, OrderStatus } from "@/lib/types";

export interface OrderDetailData {
  order_number: string;
  order_status: OrderStatus;
  created_at: string;
  customer_name: string | null;
  tableNumber: string | null;
  subtotal: number;
  total: number;
  payment_status: "unpaid" | "paid";
  amount_paid: number | null;
  change_due: number | null;
  paid_at: string | null;
  order_items: OrderItem[];
}

function dateTime(v: string) {
  return new Date(v).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Full order view shown inside the right-side drawer (orders + receipts). */
export function OrderDetailView({ order }: { order: OrderDetailData }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-lg">{order.order_number}</p>
          <p className="text-sm text-gray-500">
            {order.tableNumber ? `Table ${order.tableNumber}` : "Walk-in"}
            {order.customer_name ? ` · ${order.customer_name}` : ""}
          </p>
        </div>
        <StatusBadge status={order.order_status} />
      </div>

      <div className="text-xs text-gray-500">
        Placed {dateTime(order.created_at)}
        {order.paid_at ? ` · Paid ${dateTime(order.paid_at)}` : ""}
      </div>

      {/* Items */}
      <div className="flex flex-col divide-y divide-gray-100">
        {order.order_items.map((item) => (
          <div key={item.id} className="py-3 flex justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {item.quantity}× {item.product_name}
                {item.variant_name ? ` · ${item.variant_name}` : ""}
              </p>
              {item.addons?.length > 0 && (
                <p className="text-xs text-gray-500">
                  + {item.addons.map((a) => a.name).join(", ")}
                </p>
              )}
              {item.notes && (
                <p className="text-xs text-amber-600">📝 {item.notes}</p>
              )}
              <p className="text-xs text-gray-400">
                {formatMoney(item.unit_price)} each
              </p>
            </div>
            <span className="font-medium whitespace-nowrap">
              {formatMoney(item.subtotal)}
            </span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal)}</span>
        </div>
        <div className="flex justify-between font-bold text-base">
          <span>Total</span>
          <span className="text-brand">{formatMoney(order.total)}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="rounded-xl bg-gray-50 p-4 text-sm flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="text-gray-500">Payment</span>
          <span
            className={`font-semibold capitalize ${
              order.payment_status === "paid"
                ? "text-emerald-600"
                : "text-gray-500"
            }`}
          >
            {order.payment_status}
          </span>
        </div>
        {order.payment_status === "paid" && order.amount_paid != null && (
          <>
            <div className="flex justify-between text-gray-500">
              <span>Cash received</span>
              <span>{formatMoney(order.amount_paid)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Change</span>
              <span>{formatMoney(order.change_due ?? 0)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
