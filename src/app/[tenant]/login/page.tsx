"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { Avatar, ErrorNote } from "@/components/ui";

export default function StaffLoginPage() {
  const tenant = useTenant();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }

    // Make sure this staff account belongs to THIS tenant.
    const { data: staff } = await supabase
      .from("staff")
      .select("tenant_id, branch_id, name, role, is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    const allowed =
      staff?.is_active &&
      (staff.role === "super_admin" || staff.tenant_id === tenant.id);

    if (!allowed) {
      await supabase.auth.signOut();
      setError("This account does not have access to this restaurant.");
      setBusy(false);
      return;
    }

    // Audit trail: record the sign-in (best effort, never blocks login).
    await supabase.from("activity_logs").insert({
      tenant_id: tenant.id,
      branch_id: staff.branch_id,
      actor_id: data.user.id,
      actor_name: staff.name,
      action: "staff_signed_in",
    });

    router.push(`/${tenant.slug}/dashboard`);
    router.refresh();
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <Avatar url={tenant.logo_url} name={tenant.name} size={56} />
          <h1 className="mt-3 font-bold text-xl text-[var(--brand-dark)]">
            {tenant.name}
          </h1>
          <p className="text-sm text-gray-500">Staff sign in</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            required
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            className="input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorNote message={error} />
          <button type="submit" disabled={busy} className="btn-brand w-full py-3">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
