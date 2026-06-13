"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { EmptyState, ErrorNote } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { formatMoney, CashCount, CashMovement } from "@/lib/types";

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

export default function CashDrawerPage() {
  const supabase = useMemo(() => createClient(), []);
  const { staff, branchId } = useDashboard();
  const toast = useToast();

  const [closings, setClosings] = useState<CashCount[]>([]);
  const [todayCash, setTodayCash] = useState<number | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [expected, setExpected] = useState<number | null>(null);
  const [floatStr, setFloatStr] = useState("");
  const [floatPrefilled, setFloatPrefilled] = useState(false);
  const [counted, setCounted] = useState("");
  const [leftStr, setLeftStr] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [savingClose, setSavingClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Cash management (petty-cash in/out)
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [mvDir, setMvDir] = useState<"in" | "out">("out");
  const [mvAmount, setMvAmount] = useState("");
  const [mvReason, setMvReason] = useState("");
  const [savingMv, setSavingMv] = useState(false);
  const [mvError, setMvError] = useState<string | null>(null);

  const loadMovements = useCallback(async () => {
    if (!branchId) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("cash_movements")
      .select("*")
      .eq("branch_id", branchId)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false });
    setMovements((data as CashMovement[]) ?? []);
  }, [supabase, branchId]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  // Net effect of today's movements on the drawer (in positive, out negative).
  const movementsNet = movements.reduce(
    (sum, m) => sum + (m.direction === "in" ? 1 : -1) * Number(m.amount),
    0
  );

  async function saveMovement() {
    if (!branchId) return;
    const amt = parseFloat(mvAmount);
    if (!amt || amt <= 0) {
      setMvError("Enter an amount greater than 0.");
      return;
    }
    setSavingMv(true);
    setMvError(null);
    const { error } = await supabase.from("cash_movements").insert({
      branch_id: branchId,
      staff_id: staff.id,
      staff_name: staff.name,
      direction: mvDir,
      amount: amt,
      reason: mvReason.trim() || null,
    });
    setSavingMv(false);
    if (error) {
      setMvError(error.message);
      return;
    }
    toast(mvDir === "in" ? "Cash in recorded" : "Cash out recorded");
    setManageOpen(false);
    setMvAmount("");
    setMvReason("");
    loadMovements();
  }

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

  // Cash that entered the drawer today = orders settled today.
  const fetchTodayCash = useCallback(async () => {
    if (!branchId) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("total")
      .eq("branch_id", branchId)
      .eq("payment_status", "paid")
      .neq("order_status", "cancelled")
      .gte("paid_at", start.toISOString());
    return (data ?? []).reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }, [supabase, branchId]);

  useEffect(() => {
    fetchTodayCash().then(setTodayCash);
  }, [fetchTodayCash]);

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
    const total = await fetchTodayCash();
    setExpected(total);
    setTodayCash(total);
  }

  const floatNum = parseFloat(floatStr) || 0;
  const countedNum = parseFloat(counted);
  // Drawer should hold: float + cash sales + net cash movements.
  const expectedDrawer =
    expected != null ? floatNum + expected + movementsNet : null;
  const liveVariance =
    expectedDrawer != null && !isNaN(countedNum)
      ? Math.round((countedNum - expectedDrawer) * 100) / 100
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
      expected_cash: expected + movementsNet,
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

  return (
    <div className="flex flex-col gap-5 max-w-3xl w-full mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg">Cash drawer</h2>
          <p className="text-xs text-gray-400">
            Count the drawer at closing — catch shorts and overs early.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setMvDir("out");
              setMvAmount("");
              setMvReason("");
              setMvError(null);
              setManageOpen(true);
            }}
            className="rounded-[0.625rem] border border-gray-300 px-3 text-sm font-medium hover:bg-gray-50"
          >
            Cash management
          </button>
          <button onClick={openCloseDay} className="btn-brand text-sm">
            Close the day
          </button>
        </div>
      </div>

      {/* Today at a glance */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Cash sales today</p>
          <p className="mt-1 text-2xl font-bold text-[var(--brand-dark)]">
            {todayCash == null ? "…" : formatMoney(todayCash)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Last closing</p>
          {closings[0] ? (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <VarianceBadge v={Number(closings[0].variance)} />
              <span className="text-xs text-gray-400">
                {new Date(
                  `${closings[0].business_date}T00:00:00`
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {closings[0].staff_name}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-400">No closings yet</p>
          )}
        </div>
      </div>

      {/* Today's cash movements */}
      {movements.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Today&apos;s cash movements</h3>
            <span
              className={`text-sm font-bold ${
                movementsNet < 0 ? "text-red-500" : "text-emerald-600"
              }`}
            >
              Net {movementsNet >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(movementsNet))}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-gray-100">
            {movements.map((m) => (
              <div key={m.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {m.direction === "in" ? "Cash in" : "Cash out"}
                    {m.reason ? (
                      <span className="font-normal text-gray-500">
                        {" "}
                        · {m.reason}
                      </span>
                    ) : (
                      ""
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {m.staff_name} ·{" "}
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span
                  className={`font-semibold whitespace-nowrap ${
                    m.direction === "in" ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {m.direction === "in" ? "+" : "−"}
                  {formatMoney(m.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {closings.length === 0 ? (
        <EmptyState
          icon="💵"
          text="No closings yet. Tap “Close the day” at the end of the shift."
        />
      ) : (
        <div className="card p-5">
          <div className="flex flex-col divide-y divide-gray-100">
            {closings.map((c) => (
              <div key={c.id} className="py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {new Date(`${c.business_date}T00:00:00`).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" }
                    )}
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
        </div>
      )}

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

            <div className="rounded-xl bg-gray-50 p-4 flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Cash sales today</span>
                <span className="font-medium">
                  {expected == null ? "…" : formatMoney(expected)}
                </span>
              </div>
              {movementsNet !== 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Cash in / out</span>
                  <span className="font-medium">
                    {movementsNet >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(movementsNet))}
                  </span>
                </div>
              )}
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
                  Drawer should have {formatMoney(expectedDrawer ?? 0)}
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

      {/* Cash management dialog */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setManageOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4"
          >
            <div>
              <h3 className="font-bold text-lg">Cash management</h3>
              <p className="text-sm text-gray-500">
                Record cash added to or taken from the drawer that isn&apos;t a
                sale (e.g. supplies, change fund).
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setMvDir("out")}
                className={`flex-1 rounded-xl border px-3 py-2.5 font-medium ${
                  mvDir === "out"
                    ? "border-red-300 bg-red-50 text-red-600"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                Cash out −
              </button>
              <button
                onClick={() => setMvDir("in")}
                className={`flex-1 rounded-xl border px-3 py-2.5 font-medium ${
                  mvDir === "in"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                Cash in +
              </button>
            </div>

            <label className="text-sm font-medium">
              Amount
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                autoFocus
                className="input mt-1 text-lg font-semibold"
                placeholder="0.00"
                value={mvAmount}
                onChange={(e) => setMvAmount(e.target.value)}
              />
            </label>

            <label className="text-sm font-medium">
              Reason
              <input
                className="input mt-1"
                placeholder={
                  mvDir === "out"
                    ? "e.g. Bought napkins"
                    : "e.g. Added change fund"
                }
                value={mvReason}
                onChange={(e) => setMvReason(e.target.value)}
              />
            </label>

            <ErrorNote message={mvError} />

            <div className="flex gap-2">
              <button
                onClick={saveMovement}
                disabled={savingMv || mvAmount === ""}
                className="btn-brand flex-1 py-3 disabled:opacity-40"
              >
                {savingMv ? "Saving…" : "Record"}
              </button>
              <button
                onClick={() => setManageOpen(false)}
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
