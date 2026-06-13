"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { useDashboard } from "@/lib/dashboard-context";
import { Avatar, ErrorNote } from "@/components/ui";
import { useConfirm, useToast } from "@/components/feedback";
import { randomId } from "@/lib/uid";

const PRESET_COLORS = [
  "#e11d48", "#ea580c", "#d97706", "#16a34a",
  "#0d9488", "#0284c7", "#4f46e5", "#7c3aed",
  "#c026d3", "#db2777", "#404040", "#854d0e",
];

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const tenant = useTenant();
  const { staff } = useDashboard();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  const canEditBranding =
    staff.role === "tenant_admin" || staff.role === "super_admin";

  // ── Branding state ──────────────────────────────────────────
  const [brandColor, setBrandColor] = useState(tenant.brand_color);
  const [brandDark, setBrandDark] = useState(tenant.brand_color_dark);
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandMsg, setBrandMsg] = useState<string | null>(null);
  const [brandErr, setBrandErr] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // ── Profile state ───────────────────────────────────────────
  const [name, setName] = useState(staff.name);
  const [avatarUrl, setAvatarUrl] = useState(staff.avatar_url);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function uploadTo(
    folder: string,
    file: File
  ): Promise<string | null> {
    const ext = file.name.split(".").pop();
    const path = `${folder}/${randomId()}.${ext}`;
    const { error } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
  }

  async function handleLogoUpload(file: File) {
    setUploadingLogo(true);
    setBrandErr(null);
    try {
      const url = await uploadTo(`logos/${tenant.id}`, file);
      setLogoUrl(url);
    } catch (e) {
      setBrandErr((e as Error).message);
    }
    setUploadingLogo(false);
  }

  async function saveBranding() {
    const ok = await confirm({
      title: "Save branding changes?",
      message:
        "Your customers will see the new colors and logo across the menu and order tracking right away.",
      confirmLabel: "Save branding",
    });
    if (!ok) return;
    setSavingBrand(true);
    setBrandErr(null);
    setBrandMsg(null);
    const { error } = await supabase
      .from("tenants")
      .update({
        brand_color: brandColor,
        brand_color_dark: brandDark,
        logo_url: logoUrl,
      })
      .eq("id", tenant.id);
    setSavingBrand(false);
    if (error) return setBrandErr(error.message);
    toast("Branding saved");
    router.refresh();
  }

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true);
    setProfileErr(null);
    try {
      const url = await uploadTo(`avatars/${staff.id}`, file);
      setAvatarUrl(url);
    } catch (e) {
      setProfileErr((e as Error).message);
    }
    setUploadingAvatar(false);
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileErr(null);
    setProfileMsg(null);
    const { error } = await supabase
      .from("staff")
      .update({ name, avatar_url: avatarUrl })
      .eq("id", staff.id);
    setSavingProfile(false);
    if (error) return setProfileErr(error.message);
    toast("Profile saved");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* ── Branding (tenant admins) ─────────────────────────── */}
      {canEditBranding && (
        <section
          className="card p-6"
          style={
            {
              "--brand": brandColor,
              "--brand-dark": brandDark,
            } as React.CSSProperties
          }
        >
          <h2 className="font-bold text-lg">🎨 Brand identity</h2>
          <p className="text-sm text-gray-500 mb-5">
            Your customers see these colors and logo on the menu, order
            tracking, and your whole storefront.
          </p>

          {/* Logo */}
          <div className="flex items-center gap-4 mb-6">
            <Avatar url={logoUrl} name={tenant.name} size={72} />
            <div>
              <label className="btn-brand inline-block cursor-pointer text-sm">
                {uploadingLogo ? "Uploading…" : "📷 Upload logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    e.target.files?.[0] && handleLogoUpload(e.target.files[0])
                  }
                />
              </label>
              {logoUrl && (
                <button
                  onClick={() => setLogoUrl(null)}
                  className="block mt-2 text-xs text-red-400 hover:text-red-600"
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>

          {/* Primary color */}
          <label className="text-sm font-semibold">Primary brand color</label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBrandColor(c)}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  brandColor === c ? "border-gray-800 scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Use ${c}`}
              />
            ))}
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-gray-200"
              title="Custom color"
            />
            <code className="text-xs text-gray-400">{brandColor}</code>
          </div>

          {/* Secondary color */}
          <label className="mt-5 block text-sm font-semibold">
            Heading / dark color
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={brandDark}
              onChange={(e) => setBrandDark(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-gray-200"
            />
            <code className="text-xs text-gray-400">{brandDark}</code>
          </div>

          {/* Live preview */}
          <div className="mt-6 rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-2">Live preview</p>
            <div className="flex items-center gap-3">
              <Avatar url={logoUrl} name={tenant.name} size={40} />
              <div>
                <p className="font-bold" style={{ color: brandDark }}>
                  {tenant.name}
                </p>
                <p className="text-xs text-gray-500">Main Branch · Table T1</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <span
                className="rounded-full px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: brandColor }}
              >
                Coffee
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-600">
                Pastries
              </span>
            </div>
            <button
              className="mt-3 w-full rounded-[0.625rem] py-2.5 font-semibold text-white"
              style={{ backgroundColor: brandColor }}
            >
              🛒 2 items · Place order
            </button>
          </div>

          <ErrorNote message={brandErr} />
          {brandMsg && (
            <p className="mt-3 text-sm text-emerald-600">{brandMsg}</p>
          )}

          <button
            onClick={saveBranding}
            disabled={savingBrand || uploadingLogo}
            className="btn-brand mt-4 w-full"
          >
            {savingBrand ? "Saving…" : "Save branding"}
          </button>
        </section>
      )}

      {/* ── My profile (everyone) ────────────────────────────── */}
      <section className="card p-6">
        <h2 className="font-bold text-lg">👤 My profile</h2>
        <p className="text-sm text-gray-500 mb-5">
          Your display name and profile picture.
        </p>

        <div className="flex items-center gap-4 mb-4">
          <Avatar url={avatarUrl} name={name} size={72} />
          <div>
            <label className="btn-brand inline-block cursor-pointer text-sm">
              {uploadingAvatar ? "Uploading…" : "📷 Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && handleAvatarUpload(e.target.files[0])
                }
              />
            </label>
            {avatarUrl && (
              <button
                onClick={() => setAvatarUrl(null)}
                className="block mt-2 text-xs text-red-400 hover:text-red-600"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        <label className="text-sm font-semibold">Display name</label>
        <input
          className="input mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="mt-2 text-xs text-gray-400">
          Signed in as {staff.email} · {staff.role.replace("_", " ")}
        </p>

        <ErrorNote message={profileErr} />
        {profileMsg && (
          <p className="mt-3 text-sm text-emerald-600">{profileMsg}</p>
        )}

        <button
          onClick={saveProfile}
          disabled={savingProfile || uploadingAvatar}
          className="btn-brand mt-4 w-full"
        >
          {savingProfile ? "Saving…" : "Save profile"}
        </button>
      </section>
    </div>
  );
}
