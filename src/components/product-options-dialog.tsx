"use client";

import { useState } from "react";
import {
  Product,
  ProductVariant,
  ProductAddon,
  formatMoney,
} from "@/lib/types";

export interface OptionSelection {
  variant: ProductVariant | null;
  addons: ProductAddon[];
  quantity: number;
}

/**
 * Size + add-on picker. Shown when a product has at least one variant or
 * add-on; products with neither are added straight to the cart instead.
 */
export function ProductOptionsDialog({
  product,
  variants,
  addons,
  onClose,
  onAdd,
  addLabel = "Add",
}: {
  product: Product;
  variants: ProductVariant[];
  addons: ProductAddon[];
  onClose: () => void;
  onAdd: (selection: OptionSelection) => void;
  addLabel?: string;
}) {
  const [variantId, setVariantId] = useState<string | null>(
    variants[0]?.id ?? null
  );
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const chosenAddons = addons.filter((a) => addonIds.includes(a.id));
  const base = variant ? Number(variant.price) : Number(product.price);
  const unit = base + chosenAddons.reduce((s, a) => s + Number(a.price), 0);

  function toggleAddon(id: string) {
    setAddonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 flex flex-col gap-4 max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">{product.name}</h3>
            {product.description && (
              <p className="text-sm text-gray-500">{product.description}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 text-xl shrink-0">
            ✕
          </button>
        </div>

        {variants.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">
              Size <span className="text-gray-400 font-normal">· pick one</span>
            </p>
            <div className="flex flex-col gap-2">
              {variants.map((v) => (
                <label
                  key={v.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 cursor-pointer ${
                    variantId === v.id
                      ? "border-brand bg-gray-50"
                      : "border-gray-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="variant"
                      checked={variantId === v.id}
                      onChange={() => setVariantId(v.id)}
                    />
                    {v.name}
                  </span>
                  <span className="font-semibold">{formatMoney(v.price)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {addons.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">
              Add-ons{" "}
              <span className="text-gray-400 font-normal">· optional</span>
            </p>
            <div className="flex flex-col gap-2">
              {addons.map((a) => (
                <label
                  key={a.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 cursor-pointer ${
                    addonIds.includes(a.id)
                      ? "border-brand bg-gray-50"
                      : "border-gray-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={addonIds.includes(a.id)}
                      onChange={() => toggleAddon(a.id)}
                    />
                    {a.name}
                  </span>
                  <span className="font-semibold">+{formatMoney(a.price)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Quantity</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="h-8 w-8 rounded-full border border-gray-300 font-bold"
            >
              −
            </button>
            <span className="w-5 text-center font-semibold">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="h-8 w-8 rounded-full bg-brand text-white font-bold"
            >
              +
            </button>
          </div>
        </div>

        <button
          onClick={() => onAdd({ variant, addons: chosenAddons, quantity: qty })}
          className="btn-brand w-full py-3"
        >
          {addLabel} · {formatMoney(unit * qty)}
        </button>
      </div>
    </div>
  );
}
