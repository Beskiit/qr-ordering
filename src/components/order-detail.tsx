"use client";

import { StatusBadge } from "@/components/ui";
import { StickyNote } from "lucide-react";
import {
  formatMoney,
  orderDestination,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentChoice,
  PAYMENT_CHOICE_LABELS,
  Discount,
} from "@/lib/types";

export interface OrderDetailData {
  order_number: string;
  order_status: OrderStatus;
  order_type: OrderType;
  created_at: string;
  customer_name: string | null;
  tableNumber: string | null;
  subtotal: number;
  total: number;
  payment_status: "unpaid" | "paid";
  payment_method: PaymentChoice;
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

/** Full order view shown inside the right-side drawer (orders + receipts).
 *  Pass `discounts` + `onSetItemDiscount` to allow applying a per-item
 *  discount (active, unpaid orders); omit them for a read-only view. */
export function OrderDetailView({
  order,
  discounts,
  onSetItemDiscount,
}: {
  order: OrderDetailData;
  discounts?: Discount[];
  onSetItemDiscount?: (itemId: string, discountId: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-lg">{order.order_number}</p>
          <p className="text-sm text-gray-500">
            {orderDestination(order.order_type, order.tableNumber)}
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
          <div key={item.id} className="py-3 text-sm">
            <div className="flex justify-between gap-3">
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
                  <p className="flex items-center gap-1 text-xs text-amber-600">
                    <StickyNote className="h-3 w-3 shrink-0" />
                    {item.notes}
                  </p>
                )}
                {item.discount_percent > 0 && (
                  <p className="text-xs font-medium text-emerald-600">
                    {item.discount_name} −{Number(item.discount_percent)}%
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  {formatMoney(item.unit_price)} each
                </p>
              </div>
              <span className="font-medium whitespace-nowrap">
                {formatMoney(item.subtotal)}
              </span>
            </div>
            {discounts && onSetItemDiscount && (
              <select
                className="input mt-2 text-xs"
                value={item.discount_id ?? ""}
                onChange={(e) =>
                  onSetItemDiscount(item.id, e.target.value || null)
                }
              >
                <option value="">No discount</option>
                {discounts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({Number(d.percent)}%)
                  </option>
                ))}
              </select>
            )}
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
        <div className="flex justify-between">
          <span className="text-gray-500">Method</span>
          <span className="font-medium">
            {PAYMENT_CHOICE_LABELS[order.payment_method]}
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
