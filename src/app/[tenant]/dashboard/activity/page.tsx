"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState } from "@/components/ui";
import { formatMoney, ActivityLog } from "@/lib/types";

const PAGE_SIZE = 50;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "orders", label: "Orders" },
  { key: "payments", label: "Payments" },
  { key: "drawer", label: "Drawer" },
  { key: "sessions", label: "Staff sessions" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const FILTER_ACTIONS: Record<Exclude<FilterKey, "all">, string[]> = {
  orders: ["order_placed", "order_status_changed"],
  payments: ["payment_settled", "payment_undone"],
  drawer: ["drawer_closed"],
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
    case "payment_settled":
      return {
        icon: "💵",
        text: `Order ${num} paid · cash ${formatMoney(
          Number(d.amount_paid) || 0
        )} · change ${formatMoney(Number(d.change_due) || 0)}`,
      };
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
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

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
      const { data } = await query;
      return (data as ActivityLog[]) ?? [];
    },
    [supabase, tenant.id, filter]
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
              onClick={() => setFilter(f.key)}
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
              return (
                <div key={log.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-lg shrink-0">{icon}</span>
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
                </div>
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
    </div>
  );
}
