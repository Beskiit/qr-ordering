"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState, ErrorNote } from "@/components/ui";
import { useConfirm, useToast } from "@/components/feedback";
import { Search, UtensilsCrossed, Camera, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Category, Product, formatMoney } from "@/lib/types";
import { randomId } from "@/lib/uid";

// Editable rows for the size/add-on lists (price kept as string while typing).
type OptionRow = { id?: string; name: string; price: string };

export default function MenuManagementPage() {
  const supabase = useMemo(() => createClient(), []);
  const { branchId } = useDashboard();
  const confirm = useConfirm();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [newCategory, setNewCategory] = useState("");
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editVariants, setEditVariants] = useState<OptionRow[]>([]);
  const [editAddons, setEditAddons] = useState<OptionRow[]>([]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from("categories").select("*").eq("branch_id", branchId).order("display_order"),
      supabase.from("products").select("*").eq("branch_id", branchId).order("display_order"),
    ]);
    setCategories(cats ?? []);
    setProducts(prods ?? []);
    setLoading(false);
  }, [supabase, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Categories ──────────────────────────────────────────────
  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategory.trim() || !branchId) return;
    const { error: err } = await supabase.from("categories").insert({
      branch_id: branchId,
      name: newCategory.trim(),
      display_order: categories.length + 1,
    });
    if (err) return setError(err.message);
    setNewCategory("");
    load();
  }

  async function toggleCategory(c: Category) {
    await supabase.from("categories").update({ is_active: !c.is_active }).eq("id", c.id);
    load();
  }

  // Optional accent color per category (null = default card styling).
  async function setCategoryColor(c: Category, color: string | null) {
    await supabase.from("categories").update({ color }).eq("id", c.id);
    load();
  }

  async function deleteCategory(c: Category) {
    const ok = await confirm({
      title: `Delete "${c.name}"?`,
      message: "All products in this category will be deleted too.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const { error: err } = await supabase.from("categories").delete().eq("id", c.id);
    if (err) return setError(err.message);
    toast(`"${c.name}" deleted`);
    load();
  }

  // ── Products ────────────────────────────────────────────────
  // Open the editor and load this product's sizes + add-ons.
  async function openEditor(p?: Product) {
    setEditingProduct(p ?? { category_id: categories[0]?.id, is_available: true });
    if (p?.id) {
      const [{ data: vs }, { data: as }] = await Promise.all([
        supabase.from("product_variants").select("*").eq("product_id", p.id).order("display_order"),
        supabase.from("product_addons").select("*").eq("product_id", p.id).order("display_order"),
      ]);
      setEditVariants((vs ?? []).map((v) => ({ id: v.id, name: v.name, price: String(v.price) })));
      setEditAddons((as ?? []).map((a) => ({ id: a.id, name: a.name, price: String(a.price) })));
    } else {
      setEditVariants([]);
      setEditAddons([]);
    }
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct || !branchId) return;
    setSaving(true);
    setError(null);

    const payload = {
      branch_id: branchId,
      category_id: editingProduct.category_id,
      name: editingProduct.name,
      description: editingProduct.description || null,
      price: Number(editingProduct.price),
      image_url: editingProduct.image_url || null,
      is_available: editingProduct.is_available ?? true,
    };

    // Upsert the product, capturing its id (needed for new products).
    let productId = editingProduct.id;
    if (productId) {
      const { error: err } = await supabase.from("products").update(payload).eq("id", productId);
      if (err) {
        setSaving(false);
        return setError(err.message);
      }
    } else {
      const { data, error: err } = await supabase.from("products").insert(payload).select("id").single();
      if (err || !data) {
        setSaving(false);
        return setError(err?.message ?? "Could not save product.");
      }
      productId = data.id;
    }

    // Replace sizes + add-ons (small lists; order_items snapshot names,
    // so deleting/recreating these never affects past orders).
    const variantRows = editVariants
      .filter((v) => v.name.trim())
      .map((v, i) => ({
        product_id: productId,
        branch_id: branchId,
        name: v.name.trim(),
        price: parseFloat(v.price) || 0,
        display_order: i,
      }));
    const addonRows = editAddons
      .filter((a) => a.name.trim())
      .map((a, i) => ({
        product_id: productId,
        branch_id: branchId,
        name: a.name.trim(),
        price: parseFloat(a.price) || 0,
        display_order: i,
      }));

    await supabase.from("product_variants").delete().eq("product_id", productId);
    await supabase.from("product_addons").delete().eq("product_id", productId);
    if (variantRows.length) await supabase.from("product_variants").insert(variantRows);
    if (addonRows.length) await supabase.from("product_addons").insert(addonRows);

    setSaving(false);
    toast(editingProduct.id ? "Product updated" : "Product added");
    setEditingProduct(null);
    load();
  }

  async function deleteProduct(p: Product) {
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      message: "This removes the product and its sizes/add-ons from the menu.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const { error: err } = await supabase.from("products").delete().eq("id", p.id);
    if (err) return setError(err.message);
    toast(`"${p.name}" deleted`);
    load();
  }

  async function toggleAvailability(p: Product) {
    await supabase.from("products").update({ is_available: !p.is_available }).eq("id", p.id);
    load();
  }

  async function uploadProductImage(file: File) {
    if (!editingProduct) return;
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop();
    const path = `${branchId}/${randomId()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    setEditingProduct((prev) => ({ ...prev, image_url: data.publicUrl }));
    setUploading(false);
  }

  const query = search.trim().toLowerCase();
  const visibleProducts = products.filter(
    (p) =>
      (!categoryFilter || p.category_id === categoryFilter) &&
      (!query ||
        `${p.name} ${p.description ?? ""}`.toLowerCase().includes(query))
  );

  if (loading) return <Spinner label="Loading menu…" />;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <ErrorNote message={error} />

      {/* Categories */}
      <section className="card p-5">
        <h2 className="font-bold text-lg mb-3">Categories</h2>
        <form onSubmit={addCategory} className="flex gap-2 mb-4">
          <input
            className="input flex-1"
            placeholder="New category name (e.g. Drinks)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button className="btn-brand whitespace-nowrap">+ Add</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span
              key={c.id}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                c.is_active
                  ? "border-gray-200 bg-gray-50"
                  : "border-dashed border-gray-300 text-gray-400"
              }`}
            >
              <input
                type="color"
                value={c.color ?? "#d1d5db"}
                onChange={(e) => setCategoryColor(c, e.target.value)}
                title="Card color for this category"
                className="h-4 w-4 rounded cursor-pointer border border-gray-300 p-0 bg-transparent"
              />
              {c.name}
              {c.color && (
                <button
                  onClick={() => setCategoryColor(c, null)}
                  title="Reset to default color"
                  className="text-gray-400 hover:text-gray-600"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => toggleCategory(c)} title="Toggle visibility">
                {c.is_active ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                )}
              </button>
              <button onClick={() => deleteCategory(c)} className="text-red-400" title="Delete">
                ✕
              </button>
            </span>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-gray-400">No categories yet — add one above.</p>
          )}
        </div>
      </section>

      {/* Products */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">Products</h2>
          <button
            onClick={() => openEditor()}
            disabled={categories.length === 0}
            className="btn-brand text-sm"
          >
            + New product
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            className="input flex-1"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input !w-auto"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {products.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed className="h-10 w-10" />}
            text="No products yet."
          />
        ) : visibleProducts.length === 0 ? (
          <EmptyState
            icon={<Search className="h-10 w-10" />}
            text="No products match your search."
          />
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {visibleProducts.map((p) => (
              <div key={p.id} className="py-3 flex items-center gap-3">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
                    <UtensilsCrossed className="h-5 w-5 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${!p.is_available ? "text-gray-400 line-through" : ""}`}>
                    {p.name}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    {(() => {
                      const cat = categories.find((c) => c.id === p.category_id);
                      return (
                        <>
                          {cat?.color && (
                            <span
                              className="inline-block h-2 w-2 rounded-full shrink-0"
                              style={{ background: cat.color }}
                            />
                          )}
                          <span>
                            {cat?.name} · {formatMoney(p.price)}
                          </span>
                        </>
                      );
                    })()}
                  </p>
                </div>
                <button
                  onClick={() => toggleAvailability(p)}
                  className={`text-xs rounded-full px-2.5 py-1 font-semibold ${
                    p.is_available ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {p.is_available ? "Available" : "Sold out"}
                </button>
                <button
                  onClick={() => openEditor(p)}
                  className="text-sm text-gray-500 hover:text-gray-800 px-2"
                >
                  Edit
                </button>
                <button onClick={() => deleteProduct(p)} className="text-sm text-red-400 px-1">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Product editor modal */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setEditingProduct(null)}
        >
          <form
            onSubmit={saveProduct}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-3 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-bold text-lg">
              {editingProduct.id ? "Edit product" : "New product"}
            </h3>

            <input
              className="input"
              placeholder="Product name"
              required
              value={editingProduct.name ?? ""}
              onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
            />
            <textarea
              className="input"
              placeholder="Description (optional)"
              rows={2}
              value={editingProduct.description ?? ""}
              onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
            />
            <div className="flex gap-3">
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                placeholder="Price"
                required
                value={editingProduct.price ?? ""}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, price: e.target.value as unknown as number })
                }
              />
              <select
                className="input"
                value={editingProduct.category_id ?? ""}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, category_id: e.target.value })
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Image upload */}
            <div className="flex items-center gap-3">
              {editingProduct.image_url ? (
                <img
                  src={editingProduct.image_url}
                  alt="Preview"
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-gray-100 flex items-center justify-center">
                  <UtensilsCrossed className="h-6 w-6 text-gray-300" />
                </div>
              )}
              <label className="flex-1 cursor-pointer rounded-lg border border-dashed border-gray-300 px-3 py-3 text-center text-sm text-gray-500 hover:border-brand flex items-center justify-center gap-2">
                <Camera className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadProductImage(e.target.files[0])}
                />
              </label>
            </div>

            {/* Sizes (optional) */}
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">
                  Sizes{" "}
                  <span className="text-gray-400 font-normal">
                    · optional, customer picks one
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setEditVariants((v) => [...v, { name: "", price: "" }])}
                  className="text-xs text-brand font-semibold"
                >
                  + Add size
                </button>
              </div>
              {editVariants.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No sizes — the price above is used.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {editVariants.map((v, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="e.g. Small"
                        value={v.name}
                        onChange={(e) =>
                          setEditVariants((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r))
                          )
                        }
                      />
                      <input
                        className="input !w-24"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Price"
                        value={v.price}
                        onChange={(e) =>
                          setEditVariants((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r))
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditVariants((rows) => rows.filter((_, j) => j !== i))
                        }
                        className="text-red-400 px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add-ons (optional) */}
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">
                  Add-ons{" "}
                  <span className="text-gray-400 font-normal">
                    · optional extras
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setEditAddons((a) => [...a, { name: "", price: "" }])}
                  className="text-xs text-brand font-semibold"
                >
                  + Add-on
                </button>
              </div>
              {editAddons.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No add-ons for this product.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {editAddons.map((a, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="e.g. Extra shot"
                        value={a.name}
                        onChange={(e) =>
                          setEditAddons((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r))
                          )
                        }
                      />
                      <input
                        className="input !w-24"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="+Price"
                        value={a.price}
                        onChange={(e) =>
                          setEditAddons((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r))
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditAddons((rows) => rows.filter((_, j) => j !== i))
                        }
                        className="text-red-400 px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <ErrorNote message={error} />

            <div className="flex gap-2 mt-2">
              <button type="submit" disabled={saving || uploading} className="btn-brand flex-1">
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded-[0.625rem] border border-gray-300 px-4 font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
