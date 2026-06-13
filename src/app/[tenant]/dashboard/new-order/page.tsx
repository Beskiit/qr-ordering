"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState, ErrorNote } from "@/components/ui";
import { PaymentDialog } from "@/components/payment-dialog";
import { useConfirm, useToast } from "@/components/feedback";
import {
  ProductOptionsDialog,
  OptionSelection,
} from "@/components/product-options-dialog";
import {
  Category,
  Product,
  ProductVariant,
  ProductAddon,
  DiningTable,
  CartItem,
  OrderItem,
  formatMoney,
  lineUnitPrice,
  cartKey,
} from "@/lib/types";

// Signature of the cart's contents — to tell whether an edit changed anything.
function cartSignature(items: CartItem[]): string {
  return items
    .map((c) => `${c.key}x${c.quantity}|${c.notes.trim()}`)
    .sort()
    .join(";");
}

export default function NewOrderPage() {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit"); // editing an existing order?
  const { branchId } = useDashboard();
  const confirm = useConfirm();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // Destination: "" = walk-in, "pickup", "delivery", or a table id (dine-in).
  const [dest, setDest] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [optionsFor, setOptionsFor] = useState<Product | null>(null);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    id: string;
    number: string;
    total: number;
  } | null>(null);
  // When editing, the order we're editing (for the banner) + change tracking.
  const [editInfo, setEditInfo] = useState<{
    number: string;
    destLabel: string;
    wasPaid: boolean;
  } | null>(null);
  const [originalSig, setOriginalSig] = useState("");

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    const [{ data: cats }, { data: prods }, { data: vars }, { data: adds }, { data: tbls }] =
      await Promise.all([
        supabase.from("categories").select("*").eq("branch_id", branchId).eq("is_active", true).order("display_order"),
        supabase.from("products").select("*").eq("branch_id", branchId).eq("is_available", true).order("display_order"),
        supabase.from("product_variants").select("*").eq("branch_id", branchId).order("display_order"),
        supabase.from("product_addons").select("*").eq("branch_id", branchId).order("display_order"),
        supabase.from("tables").select("*").eq("branch_id", branchId).eq("is_active", true).order("table_number"),
      ]);
    const prodList = prods ?? [];
    const varList = vars ?? [];
    const addList = adds ?? [];
    const tblList = tbls ?? [];
    setCategories(cats ?? []);
    setProducts(prodList);
    setVariants(varList);
    setAddons(addList);
    setTables(tblList);

    // Editing an existing order: rebuild the cart from its items.
    if (editId) {
      const { data: ord } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", editId)
        .maybeSingle();
      if (ord) {
        const items = (ord.order_items ?? []) as OrderItem[];
        const rebuilt: CartItem[] = [];
        for (const oi of items) {
          const product = prodList.find((p) => p.id === oi.product_id);
          if (!product) continue; // product removed/unavailable — skip
          const pVariants = varList.filter((v) => v.product_id === product.id);
          const pAddons = addList.filter((a) => a.product_id === product.id);
          const variant = oi.variant_name
            ? pVariants.find((v) => v.name === oi.variant_name) ?? null
            : null;
          const names = (oi.addons ?? []).map((a) => a.name);
          const chosen = pAddons.filter((a) => names.includes(a.name));
          rebuilt.push({
            key: cartKey(product.id, variant?.id ?? null, chosen.map((a) => a.id)),
            product,
            variant,
            addons: chosen,
            quantity: oi.quantity,
            notes: oi.notes ?? "",
          });
        }
        setCart(rebuilt);
        setOriginalSig(cartSignature(rebuilt));
        setEditInfo({
          number: ord.order_number,
          wasPaid: ord.payment_status === "paid",
          destLabel: ord.table_id
            ? `Table ${tblList.find((t) => t.id === ord.table_id)?.table_number ?? ""}`
            : ord.order_type === "pickup"
            ? "Pickup"
            : ord.order_type === "delivery"
            ? "Delivery"
            : "Walk-in",
        });
      }
    }
    setLoading(false);
  }, [supabase, branchId, editId]);

  useEffect(() => {
    load();
  }, [load]);

  const variantsByProduct = useMemo(() => {
    const m = new Map<string, ProductVariant[]>();
    variants.forEach((v) => m.set(v.product_id, [...(m.get(v.product_id) ?? []), v]));
    return m;
  }, [variants]);
  const addonsByProduct = useMemo(() => {
    const m = new Map<string, ProductAddon[]>();
    addons.forEach((a) => m.set(a.product_id, [...(m.get(a.product_id) ?? []), a]));
    return m;
  }, [addons]);
  const hasOptions = useCallback(
    (p: Product) =>
      (variantsByProduct.get(p.id)?.length ?? 0) > 0 ||
      (addonsByProduct.get(p.id)?.length ?? 0) > 0,
    [variantsByProduct, addonsByProduct]
  );

  function addSelection(product: Product, sel: OptionSelection) {
    const key = cartKey(product.id, sel.variant?.id ?? null, sel.addons.map((a) => a.id));
    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        return prev.map((c) =>
          c.key === key ? { ...c, quantity: c.quantity + sel.quantity } : c
        );
      }
      return [
        ...prev,
        { key, product, variant: sel.variant, addons: sel.addons, quantity: sel.quantity, notes: "" },
      ];
    });
  }

  function setQty(key: string, qty: number) {
    setCart((prev) =>
      qty <= 0 ? prev.filter((c) => c.key !== key) : prev.map((c) => (c.key === key ? { ...c, quantity: qty } : c))
    );
  }

  const cartTotal = cart.reduce((s, c) => s + lineUnitPrice(c) * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const query = search.trim().toLowerCase();
  const visibleProducts = products.filter(
    (p) =>
      (!categoryFilter || p.category_id === categoryFilter) &&
      (!query || `${p.name} ${p.description ?? ""}`.toLowerCase().includes(query))
  );

  // Decode the destination selection into a table id + order type.
  const isTable = dest !== "" && dest !== "pickup" && dest !== "delivery";
  const tableIdVal = isTable ? dest : null;
  const orderType = isTable ? "dine_in" : dest === "" ? "walk_in" : dest;
  const destLabel = isTable
    ? `Table ${tables.find((t) => t.id === dest)?.table_number ?? ""}`
    : dest === "pickup"
    ? "Pickup"
    : dest === "delivery"
    ? "Delivery"
    : "Walk-in";

  async function createOrder() {
    if (!branchId || cart.length === 0) return;
    const items = cart.map((c) => ({
      product_id: c.product.id,
      quantity: c.quantity,
      notes: c.notes,
      variant_id: c.variant?.id ?? null,
      addon_ids: c.addons.map((a) => a.id),
    }));

    // Edit mode: only save (and re-collect payment) if something changed.
    if (editId) {
      if (cartSignature(cart) === originalSig) {
        toast("No changes made");
        router.push(`/${tenant.slug}/dashboard`);
        return;
      }
      const ok = await confirm({
        title: "Save changes to this order?",
        message: editInfo?.wasPaid
          ? "This order was already paid — saving the changes marks it unpaid so you can collect the new total."
          : "The order will be updated with the new items and total.",
        confirmLabel: "Save changes",
      });
      if (!ok) return;
      setCreating(true);
      setError(null);
      const { error: rpcErr } = await supabase.rpc("staff_update_order_items", {
        p_order_id: editId,
        p_items: items,
      });
      setCreating(false);
      if (rpcErr) {
        setError(rpcErr.message ?? "Could not save changes.");
        return;
      }
      toast("Order updated");
      router.push(`/${tenant.slug}/dashboard`);
      return;
    }

    setCreating(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("staff_create_order", {
      p_branch_id: branchId,
      p_table_id: tableIdVal,
      p_items: items,
      p_customer_name: customerName || null,
      p_order_type: orderType,
    });
    setCreating(false);
    if (rpcErr || !data) {
      setError(rpcErr?.message ?? "Could not create the order.");
      return;
    }
    setCreated({ id: data.order_id, number: data.order_number, total: data.total });
  }

  if (loading) return <Spinner label="Loading menu…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-lg">
          {editId ? "Edit order" : "New order"}
          {editInfo && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              {editInfo.number} · {editInfo.destLabel}
            </span>
          )}
        </h2>
        <Link
          href={`/${tenant.slug}/dashboard`}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Back to orders
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] items-start">
        {/* Product picker */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="🔍 Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="input !w-auto"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {visibleProducts.length === 0 ? (
            <EmptyState icon="🍽️" text="No matching products." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleProducts.map((p) => {
                const vs = variantsByProduct.get(p.id);
                const priceLabel = vs?.length
                  ? `from ${formatMoney(Math.min(...vs.map((v) => Number(v.price))))}`
                  : formatMoney(p.price);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      hasOptions(p)
                        ? setOptionsFor(p)
                        : addSelection(p, { variant: null, addons: [], quantity: 1 })
                    }
                    className="card p-3 text-left hover:border-brand transition flex flex-col"
                  >
                    <span className="font-semibold leading-tight">{p.name}</span>
                    <span className="mt-1 text-sm font-bold text-brand">
                      {priceLabel}
                    </span>
                    {hasOptions(p) && (
                      <span className="mt-0.5 text-xs text-gray-400">
                        Options →
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart / ticket */}
        <div className="card p-4 flex flex-col gap-3 lg:sticky lg:top-4">
          {editId ? (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              Editing <b>{editInfo?.number}</b> · {editInfo?.destLabel}
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium">For</label>
              <select
                className="input mt-1"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
              >
                <option value="">Walk-in / Counter</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
                {tables.length > 0 && (
                  <optgroup label="Dine-in (table)">
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.table_number}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {cart.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              Tap products to add them here.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {cart.map((c) => (
                <div key={c.key} className="py-2 flex items-start gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">
                      {c.product.name}
                      {c.variant ? ` · ${c.variant.name}` : ""}
                    </p>
                    {c.addons.length > 0 && (
                      <p className="text-xs text-gray-400">
                        + {c.addons.map((a) => a.name).join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      {formatMoney(lineUnitPrice(c))} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setQty(c.key, c.quantity - 1)}
                      className="h-6 w-6 rounded-full border border-gray-300 font-bold"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-semibold">
                      {c.quantity}
                    </span>
                    <button
                      onClick={() => setQty(c.key, c.quantity + 1)}
                      className="h-6 w-6 rounded-full bg-brand text-white font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!editId && (
            <input
              className="input"
              placeholder="Customer name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          )}

          <div className="flex items-center justify-between font-bold">
            <span>Total</span>
            <span className="text-brand">{formatMoney(cartTotal)}</span>
          </div>

          <ErrorNote message={error} />

          <button
            onClick={createOrder}
            disabled={creating || cart.length === 0}
            className="btn-brand w-full py-3 disabled:opacity-40"
          >
            {creating
              ? "Saving…"
              : editId
              ? `Save changes · ${cartCount} item${cartCount === 1 ? "" : "s"}`
              : `Create & take payment · ${cartCount} item${
                  cartCount === 1 ? "" : "s"
                }`}
          </button>
        </div>
      </div>

      {/* Size / add-on picker */}
      {optionsFor && (
        <ProductOptionsDialog
          product={optionsFor}
          variants={variantsByProduct.get(optionsFor.id) ?? []}
          addons={addonsByProduct.get(optionsFor.id) ?? []}
          addLabel="Add to order"
          onClose={() => setOptionsFor(null)}
          onAdd={(sel) => {
            addSelection(optionsFor, sel);
            setOptionsFor(null);
          }}
        />
      )}

      {/* Immediate payment after creating */}
      {created && (
        <PaymentDialog
          orderId={created.id}
          orderNumber={created.number}
          tableLabel={destLabel}
          total={created.total}
          onClose={() => router.push(`/${tenant.slug}/dashboard`)}
          onPaid={() => router.push(`/${tenant.slug}/dashboard`)}
        />
      )}
    </div>
  );
}
