"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState } from "@/components/ui";
import { Drawer } from "@/components/drawer";
import { MethodBadge } from "@/components/method-badge";
import {
  formatMoney,
  ActivityLog,
  PaymentChoice,
  PAYMENT_CHOICE_LABELS,
} from "@/lib/types";

// The payment method recorded on a settled-payment log, if any.
function payMethodOf(log: ActivityLog): PaymentChoice | null {
  if (log.action !== "payment_settled") return null;
  const m = log.details?.method;
  return typeof m === "string" ? (m as PaymentChoice) : "counter";
}

const PAGE_SIZE = 50;

const MONEY_KEYS = new Set([
  "total", "amount_paid", "change_due", "starting_float",
  "counted_cash", "expected_cash", "variance", "left_in_drawer", "amount",
]);

const DETAIL_LABELS: Record<string, string> = {
  order_number: "Order",
  total: "Total",
  amount_paid: "Cash received",
  change_due: "Change",
  from: "From",
  to: "To",
  method: "Method",
  amount: "Amount",
  reason: "Reason",
  direction: "Direction",
  starting_float: "Starting float",
  counted_cash: "Counted",
  expected_cash: "Expected cash",
  variance: "Variance",
  left_in_drawer: "Left in drawer",
};

function fmtDetail(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key === "method")
    return PAYMENT_CHOICE_LABELS[value as PaymentChoice] ?? String(value);
  if (MONEY_KEYS.has(key) && !isNaN(Number(value))) return formatMoney(Number(value));
  return String(value);
}

const ACTION_LABELS: Record<string, string> = {
  order_placed: "Order placed",
  order_status_changed: "Order status changed",
  order_edited: "Order edited",
  payment_settled: "Payment settled",
  payment_undone: "Payment undone",
  drawer_closed: "Drawer closed",
  cash_in: "Cash in",
  cash_out: "Cash out",
  staff_signed_in: "Signed in",
  staff_signed_out: "Signed out",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "orders", label: "Orders" },
  { key: "payments", label: "Payments" },
  { key: "drawer", label: "Drawer" },
  { key: "sessions", label: "Staff sessions" },
] as const;

// Sub-filter by method, shown only under the Payments tab.
const PAY_SUBFILTERS: { key: "all" | PaymentChoice; label: string }[] = [
  { key: "all", label: "All" },
  { key: "counter", label: "Cash" },
  { key: "gcash", label: "GCash" },
  { key: "maya", label: "Maya" },
  { key: "bank", label: "Bank transfer" },
];

type FilterKey = (typeof FILTERS)[number]["key"];

const FILTER_ACTIONS: Record<Exclude<FilterKey, "all">, string[]> = {
  orders: ["order_placed", "order_status_changed", "order_edited"],
  payments: ["payment_settled", "payment_undone"],
  drawer: ["drawer_closed", "cash_in", "cash_out"],
  sessions: ["staff_signed_in", "staff_signed_out"],
};

function describe(log: ActivityLog): { icon: string; text: string } {
  const d = log.details ?? {};
  const num = typeof d.order_number === "string" ? d.order_number : "?";
  switch (log.action) {
    case "order_placed":
      return {
        icon: "🧾",
        text: `Order ${num} placed · ${formatMoney(Number(d.total) || 0)}`,
      };
    case "order_status_changed":
      return { icon: "🔄", text: `Order ${num}: ${d.from} → ${d.to}` };
    case "order_edited":
      return {
        icon: "✏️",
        text: `Order ${num} edited · ${formatMoney(Number(d.total) || 0)}`,
      };
    case "payment_settled": {
      const method = typeof d.method === "string" ? d.method : "counter";
      if (method !== "counter") {
        return {
          icon: "💳",
          text: `Order ${num} paid · ${
            PAYMENT_CHOICE_LABELS[method as PaymentChoice] ?? method
          } ${formatMoney(Number(d.total) || 0)}`,
        };
      }
      return {
        icon: "💵",
        text: `Order ${num} paid · cash ${formatMoney(
          Number(d.amount_paid) || 0
        )} · change ${formatMoney(Number(d.change_due) || 0)}`,
      };
    }
    case "payment_undone":
      return { icon: "↩️", text: `Order ${num} payment undone` };
    case "drawer_closed": {
      const v = Number(d.variance) || 0;
      const verdict =
        Math.abs(v) < 0.005
          ? "balanced ✓"
          : v < 0
          ? `short ${formatMoney(-v)}`
          : `over ${formatMoney(v)}`;
      const left =
        d.left_in_drawer == null
          ? ""
          : ` · left ${formatMoney(Number(d.left_in_drawer) || 0)}`;
      return {
        icon: "💰",
        text: `Drawer closed · float ${formatMoney(
          Number(d.starting_float) || 0
        )} · counted ${formatMoney(
          Number(d.counted_cash) || 0
        )}${left} — ${verdict}`,
      };
    }
    case "cash_in":
      return {
        icon: "📥",
        text: `Cash in ${formatMoney(Number(d.amount) || 0)}${
          d.reason ? ` · ${d.reason}` : ""
        }`,
      };
    case "cash_out":
      return {
        icon: "📤",
        text: `Cash out ${formatMoney(Number(d.amount) || 0)}${
          d.reason ? ` · ${d.reason}` : ""
        }`,
      };
    case "staff_signed_in":
      return { icon: "🔓", text: "Signed in" };
    case "staff_signed_out":
      return { icon: "🔒", text: "Signed out" };
    default:
      return { icon: "•", text: log.action };
  }
}

export default function ActivityPage() {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const { staff, branches } = useDashboard();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [payMethod, setPayMethod] = useState<"all" | PaymentChoice>("all");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<ActivityLog | null>(null);

  const isAllowed = staff.role !== "branch_staff";

  const branchName = useMemo(() => {
    const map = new Map(branches.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [branches]);

  const fetchLogs = useCallback(
    async (offset: number) => {
      let query = supabase
        .from("activity_logs")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (filter !== "all") {
        query = query.in("action", FILTER_ACTIONS[filter]);
      }
      // Under Payments, optionally narrow to one method (jsonb field).
      if (filter === "payments" && payMethod !== "all") {
        query = query.eq("details->>method", payMethod);
      }
      const { data } = await query;
      return (data as ActivityLog[]) ?? [];
    },
    [supabase, tenant.id, filter, payMethod]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLogs(0).then((rows) => {
      if (cancelled) return;
      setLogs(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchLogs]);

  async function loadMore() {
    setLoadingMore(true);
    const rows = await fetchLogs(logs.length);
    setLogs((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  if (!isAllowed)
    return <EmptyState icon="🔒" text="Only admins can view the activity log." />;

  return (
    <div className="flex flex-col gap-4 max-w-3xl w-full mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-lg">
          Activity{" "}
          <span className="text-sm font-normal text-gray-400">
            (audit trail)
          </span>
        </h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setPayMethod("all");
              }}
              className={`px-3 py-1.5 whitespace-nowrap ${
                filter === f.key
                  ? "bg-brand text-white"
                  : "bg-white text-gray-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Payment method sub-filter */}
      {filter === "payments" && (
        <div className="flex gap-2 flex-wrap">
          {PAY_SUBFILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setPayMethod(s.key)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border ${
                payMethod === s.key
                  ? "border-brand bg-gray-50"
                  : "border-gray-200 text-gray-600 hover:border-brand"
              }`}
            >
              {s.key !== "all" && <MethodBadge type={s.key} size={18} />}
              {s.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner label="Loading activity…" />
      ) : logs.length === 0 ? (
        <EmptyState
          icon="📜"
          text="Nothing here yet. Orders, payments and staff sessions will appear as they happen."
        />
      ) : (
        <div className="card p-5">
          <div className="flex flex-col divide-y divide-gray-100">
            {logs.map((log) => {
              const { icon, text } = describe(log);
              const payMethod = payMethodOf(log);
              return (
                <button
                  key={log.id}
                  onClick={() => setSelected(log)}
                  className="w-full text-left py-2.5 flex items-center gap-3 text-sm hover:bg-gray-50 -mx-2 px-2 rounded-lg"
                >
                  {payMethod ? (
                    <MethodBadge type={payMethod} />
                  ) : (
                    <span className="text-lg shrink-0">{icon}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{text}</p>
                    <p className="text-xs text-gray-500">
                      {log.actor_name} · {branchName(log.branch_id)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
              );
            })}
          </div>

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              {loadingMore ? "Loading…" : "Load older entries"}
            </button>
          )}
        </div>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Activity details"
      >
        {selected && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              {payMethodOf(selected) ? (
                <MethodBadge type={payMethodOf(selected)!} size={32} />
              ) : (
                <span className="text-2xl">{describe(selected).icon}</span>
              )}
              <div>
                <p className="font-bold">
                  {ACTION_LABELS[selected.action] ?? selected.action}
                </p>
                <p className="text-sm text-gray-500">
                  {selected.actor_name} · {branchName(selected.branch_id)}
                </p>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {new Date(selected.created_at).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>

            {Object.keys(selected.details ?? {}).length > 0 && (
              <div className="rounded-xl bg-gray-50 p-4 flex flex-col gap-2 text-sm">
                {Object.entries(selected.details).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <span className="text-gray-500">
                      {DETAIL_LABELS[key] ?? key}
                    </span>
                    <span className="font-medium text-right break-all">
                      {fmtDetail(key, value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
