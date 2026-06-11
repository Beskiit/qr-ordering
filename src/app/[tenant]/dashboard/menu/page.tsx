"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState, ErrorNote } from "@/components/ui";
import { Category, Product, formatMoney } from "@/lib/types";
import { randomId } from "@/lib/uid";

export default function MenuManagementPage() {
  const supabase = useMemo(() => createClient(), []);
  const { branchId } = useDashboard();

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

  async function deleteCategory(c: Category) {
    if (!confirm(`Delete "${c.name}" and all its products?`)) return;
    const { error: err } = await supabase.from("categories").delete().eq("id", c.id);
    if (err) return setError(err.message);
    load();
  }

  // ── Products ────────────────────────────────────────────────
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

    const { error: err } = editingProduct.id
      ? await supabase.from("products").update(payload).eq("id", editingProduct.id)
      : await supabase.from("products").insert(payload);

    setSaving(false);
    if (err) return setError(err.message);
    setEditingProduct(null);
    load();
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    const { error: err } = await supabase.from("products").delete().eq("id", p.id);
    if (err) return setError(err.message);
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
              {c.name}
              <button onClick={() => toggleCategory(c)} title="Toggle visibility">
                {c.is_active ? "👁️" : "🚫"}
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
            onClick={() =>
              setEditingProduct({
                category_id: categories[0]?.id,
                is_available: true,
              })
            }
            disabled={categories.length === 0}
            className="btn-brand text-sm"
          >
            + New product
          </button>
        </div>

        <div className="flex gap-2 mb-4">
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
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {products.length === 0 ? (
          <EmptyState icon="🍔" text="No products yet." />
        ) : visibleProducts.length === 0 ? (
          <EmptyState icon="🔍" text="No products match your search." />
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {visibleProducts.map((p) => (
              <div key={p.id} className="py-3 flex items-center gap-3">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">🍴</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${!p.is_available ? "text-gray-400 line-through" : ""}`}>
                    {p.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {categories.find((c) => c.id === p.category_id)?.name} · {formatMoney(p.price)}
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
                  onClick={() => setEditingProduct(p)}
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
                <div className="h-16 w-16 rounded-lg bg-gray-100 flex items-center justify-center">🍴</div>
              )}
              <label className="flex-1 cursor-pointer rounded-lg border border-dashed border-gray-300 px-3 py-3 text-center text-sm text-gray-500 hover:border-[var(--brand)]">
                {uploading ? "Uploading…" : "📷 Upload photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadProductImage(e.target.files[0])}
                />
              </label>
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
