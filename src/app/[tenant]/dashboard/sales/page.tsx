"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState, ErrorNote } from "@/components/ui";
import { formatMoney, CashCount, Order, OrderItem } from "@/lib/types";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type SalesOrder = Order & { order_items: OrderItem[] };

const chartConfig = {
  revenue: { label: "Sales", color: "var(--brand)" },
} satisfies ChartConfig;

function dayLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function compactPeso(value: number) {
  if (value >= 1000)
    return `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `₱${value}`;
}

function VarianceBadge({ v }: { v: number }) {
  if (Math.abs(v) < 0.005)
    return (
      <span className="text-xs rounded-full px-2.5 py-1 font-semibold bg-emerald-100 text-emerald-700 whitespace-nowrap">
        Balanced ✓
      </span>
    );
  if (v < 0)
    return (
      <span className="text-xs rounded-full px-2.5 py-1 font-semibold bg-red-100 text-red-600 whitespace-nowrap">
        Short {formatMoney(-v)}
      </span>
    );
  return (
    <span className="text-xs rounded-full px-2.5 py-1 font-semibold bg-amber-100 text-amber-700 whitespace-nowrap">
      Over {formatMoney(v)}
    </span>
  );
}

export default function SalesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { staff, branchId } = useDashboard();

  const [range, setRange] = useState<7 | 30>(7);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const isAllowed = staff.role !== "branch_staff";

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - (range - 1));
    since.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("branch_id", branchId)
      .eq("payment_status", "paid")
      .neq("order_status", "cancelled")
      .gte("created_at", since.toISOString())
      .order("created_at");
    setOrders((data as SalesOrder[]) ?? []);
    setLoading(false);
  }, [supabase, branchId, range]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Cash drawer (end-of-day closings) ──
  const [closings, setClosings] = useState<CashCount[]>([]);
  const [closeOpen, setCloseOpen] = useState(false);
  const [expected, setExpected] = useState<number | null>(null);
  const [floatStr, setFloatStr] = useState("");
  const [floatPrefilled, setFloatPrefilled] = useState(false);
  const [counted, setCounted] = useState("");
  const [leftStr, setLeftStr] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [savingClose, setSavingClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const loadClosings = useCallback(async () => {
    if (!branchId) return;
    const { data } = await supabase
      .from("cash_counts")
      .select("*")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(10);
    setClosings((data as CashCount[]) ?? []);
  }, [supabase, branchId]);

  useEffect(() => {
    loadClosings();
  }, [loadClosings]);

  async function openCloseDay() {
    if (!branchId) return;
    setCloseOpen(true);
    setExpected(null);
    // Pre-fill the float with what the last closing left in the drawer.
    const lastLeft = closings[0]?.left_in_drawer;
    setFloatStr(lastLeft != null ? String(lastLeft) : "");
    setFloatPrefilled(lastLeft != null);
    setCounted("");
    setLeftStr("");
    setCloseNotes("");
    setCloseError(null);
    // Cash that entered the drawer today = orders settled today.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("total")
      .eq("branch_id", branchId)
      .eq("payment_status", "paid")
      .neq("order_status", "cancelled")
      .gte("paid_at", start.toISOString());
    setExpected((data ?? []).reduce((sum, o) => sum + (Number(o.total) || 0), 0));
  }

  const floatNum = parseFloat(floatStr) || 0;
  const countedNum = parseFloat(counted);
  const liveVariance =
    expected != null && !isNaN(countedNum)
      ? Math.round((countedNum - (floatNum + expected)) * 100) / 100
      : null;

  async function saveClose() {
    if (!branchId || expected == null || liveVariance == null) return;
    const leftNum = leftStr === "" ? null : parseFloat(leftStr) || 0;
    if (leftNum != null && leftNum > countedNum) {
      setCloseError("You can't leave more in the drawer than you counted.");
      return;
    }
    setSavingClose(true);
    setCloseError(null);
    const { error } = await supabase.from("cash_counts").insert({
      branch_id: branchId,
      staff_id: staff.id,
      staff_name: staff.name,
      business_date: new Date().toLocaleDateString("en-CA"), // local YYYY-MM-DD
      starting_float: floatNum,
      expected_cash: expected,
      counted_cash: countedNum,
      variance: liveVariance,
      left_in_drawer: leftNum,
      notes: closeNotes.trim() || null,
    });
    setSavingClose(false);
    if (error) {
      setCloseError(error.message);
      return;
    }
    setCloseOpen(false);
    loadClosings();
  }

  // ── Aggregations (paid orders only) ──
  const { daily, topProducts, todayRevenue, todayOrders, rangeRevenue, avgOrder } =
    useMemo(() => {
      const buckets: { day: string; revenue: number; orders: number }[] = [];
      for (let i = range - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        buckets.push({ day: dayLabel(d), revenue: 0, orders: 0 });
      }
      const byDay = new Map(buckets.map((b) => [b.day, b]));

      const todayKey = dayLabel(new Date());
      const productTotals = new Map<string, number>();
      let total = 0;

      for (const o of orders) {
        const amount = Number(o.total) || 0;
        total += amount;
        const bucket = byDay.get(dayLabel(new Date(o.created_at)));
        if (bucket) {
          bucket.revenue += amount;
          bucket.orders += 1;
        }
        for (const item of o.order_items) {
          productTotals.set(
            item.product_name,
            (productTotals.get(item.product_name) ?? 0) +
              (Number(item.subtotal) || 0)
          );
        }
      }

      const today = byDay.get(todayKey);
      const top = [...productTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, revenue]) => ({
          name: name.length > 18 ? `${name.slice(0, 17)}…` : name,
          revenue: Math.round(revenue * 100) / 100,
        }));

      return {
        daily: buckets.map((b) => ({
          ...b,
          revenue: Math.round(b.revenue * 100) / 100,
        })),
        topProducts: top,
        todayRevenue: today?.revenue ?? 0,
        todayOrders: today?.orders ?? 0,
        rangeRevenue: total,
        avgOrder: orders.length ? total / orders.length : 0,
      };
    }, [orders, range]);

  if (!isAllowed)
    return <EmptyState icon="🔒" text="Only admins can view sales reports." />;
  if (loading) return <Spinner label="Crunching the numbers…" />;

  const stats: [string, string][] = [
    ["Today's sales", formatMoney(todayRevenue)],
    ["Today's orders", String(todayOrders)],
    [`Sales (${range}d)`, formatMoney(rangeRevenue)],
    ["Avg order value", formatMoney(avgOrder)],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">
          Sales{" "}
          <span className="text-sm font-normal text-gray-400">
            (paid orders only)
          </span>
        </h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 ${
                range === r ? "bg-brand text-white" : "bg-white text-gray-600"
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--brand-dark)]">
              {value}
            </p>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon="📊"
          text="No paid orders in this period yet. Settle a payment on the Orders board and it shows up here."
        />
      ) : (
        <>
          {/* Daily revenue */}
          <div className="card p-5">
            <h3 className="font-semibold">Revenue per day</h3>
            <p className="text-xs text-gray-400 mb-4">Last {range} days</p>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-64 w-full"
            >
              <AreaChart data={daily} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={compactPeso}
                />
                <ChartTooltip
                  content={<ChartTooltipContent valueFormatter={formatMoney} />}
                />
                <Area
                  dataKey="revenue"
                  type="monotone"
                  fill="var(--color-revenue)"
                  fillOpacity={0.12}
                  stroke="var(--color-revenue)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ChartContainer>
          </div>

          {/* Top products */}
          <div className="card p-5">
            <h3 className="font-semibold">Top products</h3>
            <p className="text-xs text-gray-400 mb-4">
              By sales, last {range} days
            </p>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-64 w-full"
            >
              <BarChart
                data={topProducts}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={compactPeso}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={130}
                />
                <ChartTooltip
                  content={<ChartTooltipContent valueFormatter={formatMoney} />}
                />
                <Bar
                  dataKey="revenue"
                  fill="var(--color-revenue)"
                  radius={6}
                  barSize={22}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </>
      )}

      {/* Cash drawer — end-of-day reconciliation */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Cash drawer</h3>
            <p className="text-xs text-gray-400">
              Count the drawer at closing — catch shorts and overs early.
            </p>
          </div>
          <button onClick={openCloseDay} className="btn-brand text-sm">
            Close the day
          </button>
        </div>

        {closings.length > 0 && (
          <div className="mt-4 flex flex-col divide-y divide-gray-100">
            {closings.map((c) => (
              <div key={c.id} className="py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {new Date(
                      `${c.business_date}T00:00:00`
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                    <span className="text-gray-400 font-normal">
                      {" "}
                      · {c.staff_name}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    Drawer should have{" "}
                    {formatMoney(
                      Number(c.expected_cash) + Number(c.starting_float)
                    )}{" "}
                    · Counted {formatMoney(c.counted_cash)}
                    {c.left_in_drawer != null
                      ? ` · Left ${formatMoney(c.left_in_drawer)}`
                      : ""}
                    {c.notes ? ` · “${c.notes}”` : ""}
                  </p>
                </div>
                <VarianceBadge v={Number(c.variance)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close-the-day dialog */}
      {closeOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setCloseOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            <div>
              <h3 className="font-bold text-lg">Close the day</h3>
              <p className="text-sm text-gray-500">
                Count the cash in the drawer and compare against sales.
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <p className="text-xs text-gray-500">Cash sales today</p>
              <p className="text-2xl font-bold text-brand">
                {expected == null ? "…" : formatMoney(expected)}
              </p>
            </div>

            <label className="text-sm font-medium">
              Starting float (change fund)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="input mt-1"
                placeholder="0.00"
                value={floatStr}
                onChange={(e) => {
                  setFloatStr(e.target.value);
                  setFloatPrefilled(false);
                }}
              />
              {floatPrefilled && (
                <span className="block mt-1 text-xs font-normal text-gray-400">
                  Pre-filled from the last closing — edit if the drawer started
                  differently.
                </span>
              )}
            </label>

            <label className="text-sm font-medium">
              Counted cash in drawer
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="input mt-1"
                placeholder="0.00"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </label>

            <label className="text-sm font-medium">
              Left in drawer for tomorrow
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="input mt-1"
                placeholder="e.g. 1000.00"
                value={leftStr}
                onChange={(e) => setLeftStr(e.target.value)}
              />
              <span className="block mt-1 text-xs font-normal text-gray-400">
                Becomes tomorrow&apos;s starting float automatically. Take the
                rest out for deposit.
              </span>
            </label>

            <label className="text-sm font-medium">
              Notes (optional)
              <input
                className="input mt-1"
                placeholder="e.g. ₱100 taken for supplies"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
              />
            </label>

            {liveVariance != null && (
              <div
                className={`rounded-xl p-4 text-center ${
                  Math.abs(liveVariance) < 0.005
                    ? "bg-emerald-50"
                    : liveVariance < 0
                    ? "bg-red-50"
                    : "bg-amber-50"
                }`}
              >
                <p className="text-xs text-gray-500">
                  Drawer should have {formatMoney(expected! + floatNum)}
                </p>
                <div className="mt-1.5 flex justify-center">
                  <VarianceBadge v={liveVariance} />
                </div>
              </div>
            )}

            <ErrorNote message={closeError} />

            <div className="flex gap-2">
              <button
                onClick={saveClose}
                disabled={savingClose || expected == null || counted === ""}
                className="btn-brand flex-1 py-3 disabled:opacity-40"
              >
                {savingClose ? "Saving…" : "Save closing"}
              </button>
              <button
                onClick={() => setCloseOpen(false)}
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
