"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Spinner, EmptyState, ErrorNote } from "@/components/ui";
import { useToast } from "@/components/feedback";
import { Lock, QrCode, Camera } from "lucide-react";
import {
  PaymentMethod,
  PaymentMethodType,
  PAYMENT_METHOD_LABELS,
} from "@/lib/types";
import { randomId } from "@/lib/uid";

interface Draft {
  is_enabled: boolean;
  account_name: string;
  account_number: string;
  qr_url: string | null;
}

const TYPES: PaymentMethodType[] = ["gcash", "maya", "bank"];

const emptyDraft = (): Draft => ({
  is_enabled: false,
  account_name: "",
  account_number: "",
  qr_url: null,
});

export default function PaymentOptionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const { staff } = useDashboard();
  const toast = useToast();

  const isAllowed =
    staff.role === "tenant_admin" || staff.role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<PaymentMethodType | null>(null);
  const [methods, setMethods] = useState<Record<PaymentMethodType, Draft>>({
    gcash: emptyDraft(),
    maya: emptyDraft(),
    bank: emptyDraft(),
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("tenant_id", tenant.id);
    const next: Record<PaymentMethodType, Draft> = {
      gcash: emptyDraft(),
      maya: emptyDraft(),
      bank: emptyDraft(),
    };
    (data as PaymentMethod[] | null)?.forEach((m) => {
      next[m.type] = {
        is_enabled: m.is_enabled,
        account_name: m.account_name ?? "",
        account_number: m.account_number ?? "",
        qr_url: m.qr_url,
      };
    });
    setMethods(next);
    setLoading(false);
  }, [supabase, tenant.id]);

  useEffect(() => {
    load();
  }, [load]);

  function update(type: PaymentMethodType, patch: Partial<Draft>) {
    setMethods((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  async function uploadQR(type: PaymentMethodType, file: File) {
    setUploading(type);
    setError(null);
    const ext = file.name.split(".").pop();
    const path = `payment-qr/${tenant.id}/${type}-${randomId()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setError(upErr.message);
      setUploading(null);
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    update(type, { qr_url: data.publicUrl });
    setUploading(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const rows = TYPES.map((type, i) => ({
      tenant_id: tenant.id,
      type,
      is_enabled: methods[type].is_enabled,
      account_name: methods[type].account_name.trim() || null,
      account_number: methods[type].account_number.trim() || null,
      qr_url: methods[type].qr_url,
      display_order: i,
    }));
    const { error: err } = await supabase
      .from("payment_methods")
      .upsert(rows, { onConflict: "tenant_id,type" });
    setSaving(false);
    if (err) return setError(err.message);
    toast("Payment options saved");
  }

  if (!isAllowed)
    return (
      <EmptyState
        icon={<Lock className="h-10 w-10" />}
        text="Only the tenant admin can manage payment options."
      />
    );
  if (loading) return <Spinner label="Loading payment options…" />;

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="font-bold text-lg">Payment options</h2>
        <p className="text-sm text-gray-500">
          Enable the e-wallets and bank you accept, and upload each QR code.
          Customers see these on their order page so they can scan and pay.
        </p>
      </div>

      <ErrorNote message={error} />

      {TYPES.map((type) => {
        const m = methods[type];
        return (
          <section key={type} className="card p-5 flex flex-col gap-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-semibold">{PAYMENT_METHOD_LABELS[type]}</span>
              <span className="flex items-center gap-2 text-sm text-gray-500">
                {m.is_enabled ? "Enabled" : "Off"}
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={m.is_enabled}
                  onChange={(e) => update(type, { is_enabled: e.target.checked })}
                />
              </span>
            </label>

            {m.is_enabled && (
              <div className="flex flex-col gap-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    className="input"
                    placeholder={type === "bank" ? "Account name" : "Account name"}
                    value={m.account_name}
                    onChange={(e) => update(type, { account_name: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder={
                      type === "bank" ? "Account number" : "Mobile number"
                    }
                    value={m.account_number}
                    onChange={(e) =>
                      update(type, { account_number: e.target.value })
                    }
                  />
                </div>

                <div className="flex items-center gap-3">
                  {m.qr_url ? (
                    <img
                      src={m.qr_url}
                      alt={`${PAYMENT_METHOD_LABELS[type]} QR`}
                      className="h-24 w-24 rounded-lg object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="h-24 w-24 rounded-lg bg-gray-100 flex items-center justify-center">
                      <QrCode className="h-8 w-8 text-gray-300" />
                    </div>
                  )}
                  <label className="flex-1 cursor-pointer rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 hover:border-brand flex items-center justify-center gap-2">
                    <Camera className="h-4 w-4" />
                    {uploading === type
                      ? "Uploading…"
                      : m.qr_url
                      ? "Replace QR code"
                      : "Upload QR code"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        e.target.files?.[0] && uploadQR(type, e.target.files[0])
                      }
                    />
                  </label>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <button
        onClick={save}
        disabled={saving}
        className="btn-brand w-full py-3 disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save payment options"}
      </button>
    </div>
  );
}
