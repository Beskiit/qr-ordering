"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ErrorNote } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function SuperAdminLoginPage() {
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

    const { data: staff } = await supabase
      .from("staff")
      .select("role, is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!staff?.is_active || staff.role !== "super_admin") {
      await supabase.auth.signOut();
      setError("This account is not a super admin.");
      setBusy(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-900">
      <div className="card w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <ShieldCheck className="h-8 w-8 mx-auto text-[var(--brand)]" />
          <h1 className="mt-2 font-bold text-xl">Super Admin</h1>
          <p className="text-sm text-gray-500">Platform management</p>
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
