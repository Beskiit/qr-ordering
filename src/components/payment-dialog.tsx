"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { formatMoney, PaymentChoice, PaymentMethodType } from "@/lib/types";
import { MethodBadge, METHOD_META } from "@/components/method-badge";

/**
 * POS payment dialog. Staff pick how the customer paid:
 *  • Cash (over the counter) → keypad + change calculation.
 *  • An enabled e-wallet/bank → mark paid, no change needed.
 * The chosen method is saved on the order (and logged in Activity).
 */
export function PaymentDialog({
  orderId,
  orderNumber,
  tableLabel,
  total,
  onClose,
  onPaid,
}: {
  orderId: string;
  orderNumber: string;
  tableLabel: string;
  total: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<PaymentChoice>("counter");
  const [online, setOnline] = useState<PaymentMethodType[]>([]);

  // Which online methods this tenant has enabled.
  useEffect(() => {
    supabase
      .from("payment_methods")
      .select("type")
      .eq("tenant_id", tenant.id)
      .eq("is_enabled", true)
      .order("display_order")
      .then(({ data }) =>
        setOnline((data ?? []).map((r) => r.type as PaymentMethodType))
      );
  }, [supabase, tenant.id]);

  const isCash = method === "counter";
  const tenderedNum = parseFloat(tendered) || 0;
  const change = tenderedNum - total;

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
    if (busy) return;
    if (isCash && tenderedNum < total) return;
    setBusy(true);
    await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        payment_method: method,
        amount_paid: isCash ? tenderedNum : total,
        change_due: isCash ? Math.round(change * 100) / 100 : 0,
        paid_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    setBusy(false);
    onPaid();
  }, [busy, isCash, tenderedNum, total, change, method, supabase, orderId, onPaid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isCash && /^[0-9]$/.test(e.key)) appendKey(e.key);
      else if (isCash && (e.key === "." || e.key === ",")) appendKey(".");
      else if (isCash && e.key === "Backspace") appendKey("back");
      else if (e.key === "Enter") confirmPayment();
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appendKey, confirmPayment, onClose, isCash]);

  const choices: PaymentChoice[] = ["counter", ...online];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[92vh] overflow-y-auto"
      >
        <div>
          <h3 className="font-bold text-lg">Take payment</h3>
          <p className="text-sm text-gray-500">
            {orderNumber} · {tableLabel}
          </p>
        </div>

        {/* Method picker (only when the tenant has online methods enabled) */}
        {online.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => setMethod(c)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
                  method === c
                    ? "border-brand bg-gray-50"
                    : "border-gray-200 hover:border-brand"
                }`}
              >
                <MethodBadge type={c} />
                {METHOD_META[c].label}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl bg-gray-50 p-4 text-center">
          <p className="text-xs text-gray-500">Amount due</p>
          <p className="text-3xl font-bold text-brand">{formatMoney(total)}</p>
        </div>

        {isCash ? (
          <>
            <div>
              {/* No <input>: the on-screen keyboard never pops up on tablets. */}
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

              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setTendered(String(total))}
                  className="text-xs rounded-full border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-50"
                >
                  Exact
                </button>
                {[100, 200, 500, 1000]
                  .filter((bill) => bill >= total)
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
          </>
        ) : (
          <div className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-600">
            Customer pays <b>{formatMoney(total)}</b> via{" "}
            {METHOD_META[method].label}. Tap confirm once you&apos;ve received
            it.
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={confirmPayment}
            disabled={busy || (isCash && tenderedNum < total)}
            className="btn-brand flex-1 py-3 disabled:opacity-40"
          >
            {busy
              ? "Saving…"
              : isCash
              ? "Confirm payment"
              : `Confirm ${METHOD_META[method].label} payment`}
          </button>
          <button
            onClick={onClose}
            className="rounded-[0.625rem] border border-gray-300 px-4 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
