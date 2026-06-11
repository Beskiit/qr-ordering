"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { Spinner, EmptyState, ErrorNote, Avatar } from "@/components/ui";
import {
  Branch,
  CartItem,
  Category,
  DiningTable,
  Product,
  formatMoney,
} from "@/lib/types";

export default function MenuPage() {
  const tenant = useTenant();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const qrToken = searchParams.get("t");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [table, setTable] = useState<DiningTable | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [placing, setPlacing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let branchId: string | null = null;

      if (qrToken) {
        const { data: t } = await supabase
          .from("tables")
          .select("*")
          .eq("qr_token", qrToken)
          .eq("is_active", true)
          .maybeSingle();
        if (t) {
          setTable(t);
          branchId = t.branch_id;
        }
      }

      let br: Branch | null = null;
      if (branchId) {
        const { data } = await supabase
          .from("branches")
          .select("*")
          .eq("id", branchId)
          .maybeSingle();
        br = data;
      } else {
        const { data } = await supabase
          .from("branches")
          .select("*")
          .eq("tenant_id", tenant.id)
          .eq("is_active", true)
          .order("created_at")
          .limit(1)
          .maybeSingle();
        br = data;
      }

      if (!br) {
        setError("This restaurant has no menu available yet.");
        return;
      }
      setBranch(br);

      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("branch_id", br.id)
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("products")
          .select("*")
          .eq("branch_id", br.id)
          .order("is_available", { ascending: false }) // sold out sinks to the bottom
          .order("display_order"),
      ]);
      setCategories(cats ?? []);
      setProducts(prods ?? []);
      setActiveCategory(cats?.[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [qrToken, supabase, tenant.id]);

  useEffect(() => {
    load();
  }, [load]);

  // If an item sells out (or disappears) after it was added, drop it
  // from the cart — place_order would reject the whole order otherwise.
  useEffect(() => {
    setCart((prev) =>
      prev.filter(
        (c) => products.find((p) => p.id === c.product.id)?.is_available
      )
    );
  }, [products]);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1, notes: "" }];
    });
  }

  function setQty(productId: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((c) => c.product.id !== productId)
        : prev.map((c) =>
            c.product.id === productId ? { ...c, quantity: qty } : c
          )
    );
  }

  function setNotes(productId: string, notes: string) {
    setCart((prev) =>
      prev.map((c) => (c.product.id === productId ? { ...c, notes } : c))
    );
  }

  const cartTotal = cart.reduce(
    (sum, c) => sum + Number(c.product.price) * c.quantity,
    0
  );
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // Searching looks across ALL categories; otherwise show the active tab.
  const query = search.trim().toLowerCase();
  const visibleProducts = query
    ? products.filter((p) =>
        `${p.name} ${p.description ?? ""}`.toLowerCase().includes(query)
      )
    : products.filter((p) => p.category_id === activeCategory);

  async function placeOrder() {
    if (!table || cart.length === 0) return;
    setPlacing(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("place_order", {
      p_qr_token: table.qr_token,
      p_items: cart.map((c) => ({
        product_id: c.product.id,
        quantity: c.quantity,
        notes: c.notes,
      })),
      p_customer_name: customerName || null,
    });
    setPlacing(false);
    if (rpcError) {
      setError(rpcError.message);
      // Likely cause: an item sold out mid-order. Refresh the menu so
      // sold-out badges appear and the cart drops unavailable items.
      load();
      return;
    }
    router.push(`/${tenant.slug}/track/${data.order_number}`);
  }

  if (loading) return <Spinner label="Loading menu…" />;

  return (
    <div className="flex flex-col flex-1 max-w-2xl w-full mx-auto pb-28">
      {/* Branded header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="px-4 py-3 flex items-center gap-3">
          <Avatar url={tenant.logo_url} name={tenant.name} size={42} />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg leading-tight truncate text-[var(--brand-dark)]">
              {tenant.name}
            </h1>
            <p className="text-xs text-gray-500 truncate">
              {branch?.name}
              {table ? ` · Table ${table.table_number}` : " · Browsing only"}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              🔍
            </span>
            <input
              className="w-full rounded-full bg-gray-100 pl-9 pr-9 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-gray-200"
              placeholder="Search the menu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        {categories.length > 0 && (
          <nav className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCategory(c.id);
                  setSearch("");
                }}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  activeCategory === c.id && !search.trim()
                    ? "bg-brand text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {c.name}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="px-4 py-4 flex flex-col gap-3">
        <ErrorNote message={error} />

        {!table && !error && (
          <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
            👀 You&apos;re browsing the menu. Scan the QR code on your table to
            place an order.
          </p>
        )}

        {visibleProducts.length === 0 && !error ? (
          <EmptyState
            icon={query ? "🔍" : "🍽️"}
            text={
              query
                ? `No results for “${search.trim()}”`
                : "No items in this category yet."
            }
          />
        ) : (
          visibleProducts
            .map((p) => {
              const inCart = cart.find((c) => c.product.id === p.id);
              return (
                <div
                  key={p.id}
                  className={`card p-3 flex gap-3 items-center ${
                    !p.is_available ? "opacity-60" : ""
                  }`}
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className={`h-20 w-20 rounded-xl object-cover shrink-0 ${
                        !p.is_available ? "grayscale" : ""
                      }`}
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">
                      🍴
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold leading-tight">{p.name}</h3>
                    {p.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                        {p.description}
                      </p>
                    )}
                    <p className="mt-1 font-bold text-brand">
                      {formatMoney(p.price)}
                    </p>
                  </div>
                  {!p.is_available && (
                    <span className="shrink-0 rounded-full bg-gray-200 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                      Sold out
                    </span>
                  )}
                  {p.is_available &&
                    table &&
                    (inCart ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setQty(p.id, inCart.quantity - 1)}
                          className="h-8 w-8 rounded-full border border-gray-300 font-bold hover:bg-gray-50"
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-semibold">
                          {inCart.quantity}
                        </span>
                        <button
                          onClick={() => setQty(p.id, inCart.quantity + 1)}
                          className="h-8 w-8 rounded-full bg-brand text-white font-bold"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(p)}
                        className="h-9 w-9 rounded-full bg-brand text-white text-xl font-bold shrink-0"
                        aria-label={`Add ${p.name}`}
                      >
                        +
                      </button>
                    ))}
                </div>
              );
            })
        )}
      </main>

      {/* Cart bar */}
      {table && cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-4 max-w-2xl mx-auto">
          <button
            onClick={() => setCartOpen(true)}
            className="btn-brand w-full flex items-center justify-between px-5 py-3.5 shadow-lg"
          >
            <span>
              🛒 {cartCount} item{cartCount > 1 ? "s" : ""}
            </span>
            <span>{formatMoney(cartTotal)} · View order</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">Your order</h2>
              <button
                onClick={() => setCartOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {cart.map((c) => (
                <div key={c.product.id} className="border-b border-gray-100 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{c.product.name}</p>
                      <p className="text-sm text-gray-500">
                        {formatMoney(c.product.price)} ×&nbsp;{c.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQty(c.product.id, c.quantity - 1)}
                        className="h-7 w-7 rounded-full border border-gray-300 font-bold"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold">
                        {c.quantity}
                      </span>
                      <button
                        onClick={() => setQty(c.product.id, c.quantity + 1)}
                        className="h-7 w-7 rounded-full bg-brand text-white font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    className="input mt-2 text-sm"
                    placeholder="Special requests (optional)"
                    value={c.notes}
                    onChange={(e) => setNotes(c.product.id, e.target.value)}
                  />
                </div>
              ))}

              <input
                className="input"
                placeholder="Your name (optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />

              <div className="flex items-center justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-brand">{formatMoney(cartTotal)}</span>
              </div>

              <ErrorNote message={error} />

              <button
                onClick={placeOrder}
                disabled={placing}
                className="btn-brand w-full py-3.5 text-base"
              >
                {placing ? "Placing order…" : `Place order · ${formatMoney(cartTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
