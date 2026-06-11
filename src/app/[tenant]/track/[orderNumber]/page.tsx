"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { Spinner, Avatar } from "@/components/ui";
import { formatMoney, ORDER_STATUS_FLOW, OrderStatus } from "@/lib/types";

interface TrackedItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
}

interface TrackedOrder {
  order_number: string;
  order_status: OrderStatus;
  payment_status: string;
  table_number: string;
  subtotal: number;
  total: number;
  created_at: string;
  items: TrackedItem[];
}

const STATUS_LABELS: Record<string, [string, string]> = {
  pending: ["🕐", "Order received"],
  confirmed: ["✅", "Confirmed by staff"],
  preparing: ["👨‍🍳", "Being prepared"],
  ready: ["🔔", "Ready — coming to your table!"],
  completed: ["🎉", "Served. Enjoy!"],
  cancelled: ["❌", "Order cancelled"],
};

export default function TrackOrderPage() {
  const tenant = useTenant();
  const supabase = useMemo(() => createClient(), []);
  const { orderNumber } = useParams<{ orderNumber: string }>();

  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    const { data } = await supabase.rpc("track_order", {
      p_order_number: decodeURIComponent(orderNumber),
    });
    setOrder(data);
    setLoading(false);
  }, [supabase, orderNumber]);

  useEffect(() => {
    fetchOrder();
    // Poll for status changes while the order is active.
    const interval = setInterval(fetchOrder, 5000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  // ── Buzzer: ring this phone when the order becomes ready ──
  const [buzzerOn, setBuzzerOn] = useState(false);
  const [buzzing, setBuzzing] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buzzGainRef = useRef<GainNode | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  const vibrateRef = useRef<number | null>(null);
  const prevStatusRef = useRef<OrderStatus | null>(null);

  const enableBuzzer = useCallback(async () => {
    // Must run inside the tap gesture — this is what unlocks audio playback.
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = audioCtxRef.current ?? new Ctx();
    audioCtxRef.current = ctx;
    await ctx.resume().catch(() => {});
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => {});
    }
    if ("serviceWorker" in navigator) {
      swRegRef.current = await navigator.serviceWorker
        .register("/sw.js")
        .catch(() => null);
    }
    setBuzzerOn(true);
  }, []);

  const stopBuzzing = useCallback(() => {
    buzzGainRef.current?.disconnect();
    buzzGainRef.current = null;
    if (vibrateRef.current !== null) {
      clearInterval(vibrateRef.current);
      vibrateRef.current = null;
    }
    navigator.vibrate?.(0);
    setBuzzing(false);
  }, []);

  const startBuzzing = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (ctx) {
      ctx.resume().catch(() => {});
      buzzGainRef.current?.disconnect();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      buzzGainRef.current = master;
      // Schedule ~90s of pager bursts on the audio clock — keeps ringing
      // even when the tab is backgrounded and JS timers are throttled.
      const t0 = ctx.currentTime + 0.05;
      for (let burst = 0; burst < 60; burst++) {
        const bt = t0 + burst * 1.5;
        for (let beep = 0; beep < 3; beep++) {
          const start = bt + beep * 0.22;
          const osc = ctx.createOscillator();
          osc.type = "square";
          osc.frequency.value = 880;
          const env = ctx.createGain();
          env.gain.setValueAtTime(0, start);
          env.gain.linearRampToValueAtTime(1, start + 0.01);
          env.gain.setValueAtTime(1, start + 0.14);
          env.gain.linearRampToValueAtTime(0, start + 0.16);
          osc.connect(env).connect(master);
          osc.start(start);
          osc.stop(start + 0.18);
        }
      }
    }
    if (navigator.vibrate) {
      navigator.vibrate([400, 200, 400, 200, 400]);
      vibrateRef.current = window.setInterval(
        () => navigator.vibrate([400, 200, 400, 200, 400]),
        1800
      );
    }
    setBuzzing(true);
  }, []);

  const notifyReady = useCallback(
    async (orderNo: string) => {
      if (!("Notification" in window) || Notification.permission !== "granted")
        return;
      const title = `🔔 ${tenant.name} — order ready!`;
      const options: NotificationOptions & { vibrate?: number[] } = {
        body: `Order ${orderNo} is ready and coming to your table.`,
        tag: "order-ready",
        vibrate: [400, 200, 400, 200, 400],
        data: { url: window.location.pathname },
      };
      try {
        const reg =
          swRegRef.current ??
          ("serviceWorker" in navigator
            ? (await navigator.serviceWorker.getRegistration()) ?? null
            : null);
        if (reg) {
          await reg.showNotification(title, options);
          return;
        }
      } catch {
        // fall through to the constructor (desktop browsers)
      }
      try {
        new Notification(title, options);
      } catch {
        // notifications unavailable — sound/vibration still ring
      }
    },
    [tenant.name]
  );

  // Fire the buzzer the moment the status flips to "ready".
  useEffect(() => {
    const status = order?.order_status;
    if (!status) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === "ready" && prev !== null && prev !== "ready" && buzzerOn) {
      startBuzzing();
      notifyReady(order.order_number);
    } else if (status !== "ready" && prev === "ready") {
      stopBuzzing(); // staff served it while ringing
    }
  }, [order, buzzerOn, startBuzzing, stopBuzzing, notifyReady]);

  // Silence everything if the customer leaves the page.
  useEffect(() => stopBuzzing, [stopBuzzing]);

  if (loading) return <Spinner label="Finding your order…" />;

  if (!order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="text-5xl">🔍</div>
        <h1 className="mt-3 font-bold text-xl">Order not found</h1>
        <p className="mt-1 text-gray-500 text-sm">
          We couldn&apos;t find an order with that number.
        </p>
        <Link href={`/${tenant.slug}/menu`} className="btn-brand mt-6">
          Back to menu
        </Link>
      </div>
    );
  }

  const currentIdx = ORDER_STATUS_FLOW.indexOf(order.order_status);
  const isCancelled = order.order_status === "cancelled";
  const waitingForFood =
    !isCancelled &&
    currentIdx >= 0 &&
    currentIdx < ORDER_STATUS_FLOW.indexOf("ready");

  return (
    <div className="max-w-md w-full mx-auto p-5 flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Avatar url={tenant.logo_url} name={tenant.name} size={42} />
        <div>
          <h1 className="font-bold text-lg text-[var(--brand-dark)]">
            {tenant.name}
          </h1>
          <p className="text-xs text-gray-500">
            Order {order.order_number} · Table {order.table_number}
          </p>
        </div>
      </header>

      {/* Live status */}
      <div className="card p-5 text-center">
        <div className="text-5xl">
          {STATUS_LABELS[order.order_status]?.[0] ?? "🕐"}
        </div>
        <h2 className="mt-2 font-bold text-xl">
          {STATUS_LABELS[order.order_status]?.[1] ?? order.order_status}
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Status updates automatically
        </p>
      </div>

      {/* Buzzer opt-in / status */}
      {waitingForFood && !buzzerOn && (
        <button onClick={enableBuzzer} className="btn-brand w-full py-3">
          🔔 Buzz this phone when it&apos;s ready
        </button>
      )}
      {waitingForFood && buzzerOn && (
        <p className="text-center text-sm text-gray-500">
          🔔 Buzzer on — keep this page open and we&apos;ll ring when your
          order is ready.
        </p>
      )}

      {/* Ringing overlay — tap anywhere to stop */}
      {buzzing && (
        <button
          onClick={stopBuzzing}
          className="fixed inset-0 z-50 bg-brand text-white flex flex-col items-center justify-center gap-3"
        >
          <span className="text-7xl animate-bounce">🔔</span>
          <span className="font-bold text-2xl">Your order is ready!</span>
          <span className="text-sm opacity-80">Tap anywhere to stop</span>
        </button>
      )}

      {/* Progress steps */}
      {!isCancelled && (
        <div className="card p-5">
          <ol className="flex flex-col gap-0">
            {ORDER_STATUS_FLOW.map((s, i) => {
              const done = i <= currentIdx;
              return (
                <li key={s} className="flex gap-3 items-stretch">
                  <div className="flex flex-col items-center">
                    <span
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        done ? "bg-brand text-white" : "bg-gray-200 text-gray-400"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    {i < ORDER_STATUS_FLOW.length - 1 && (
                      <span
                        className={`w-0.5 flex-1 min-h-5 ${
                          i < currentIdx ? "bg-brand" : "bg-gray-200"
                        }`}
                      />
                    )}
                  </div>
                  <p
                    className={`pb-5 pt-1 text-sm capitalize ${
                      done ? "font-semibold" : "text-gray-400"
                    }`}
                  >
                    {STATUS_LABELS[s]?.[1] ?? s}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Items */}
      <div className="card p-5">
        <h3 className="font-semibold mb-3">Order summary</h3>
        <div className="flex flex-col gap-2">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>
                {item.quantity}× {item.product_name}
                {item.notes && (
                  <span className="block text-xs text-gray-400">
                    “{item.notes}”
                  </span>
                )}
              </span>
              <span className="font-medium">{formatMoney(item.subtotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between font-bold">
          <span>Total</span>
          <span className="text-brand">{formatMoney(order.total)}</span>
        </div>
        <p className="mt-2 text-xs text-gray-400 capitalize">
          Payment: {order.payment_status}
        </p>
      </div>

      <Link
        href={`/${tenant.slug}/menu`}
        className="text-center text-sm text-gray-500 hover:text-gray-700 pb-8"
      >
        ← Back to menu
      </Link>
    </div>
  );
}
