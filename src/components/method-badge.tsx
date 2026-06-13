import { PaymentChoice } from "@/lib/types";

// Brand-ish monogram per payment method (acts as a simple logo).
export const METHOD_META: Record<
  PaymentChoice,
  { label: string; mono: string; color: string }
> = {
  counter: { label: "Cash", mono: "₱", color: "#16a34a" },
  gcash: { label: "GCash", mono: "G", color: "#007DFE" },
  maya: { label: "Maya", mono: "M", color: "#0AB287" },
  bank: { label: "Bank", mono: "🏦", color: "#475569" },
};

export function MethodBadge({
  type,
  size = 24,
}: {
  type: PaymentChoice;
  size?: number;
}) {
  const m = METHOD_META[type];
  return (
    <span
      className="rounded-md flex items-center justify-center text-white font-bold shrink-0"
      style={{
        background: m.color,
        width: size,
        height: size,
        fontSize: size * 0.5,
      }}
    >
      {m.mono}
    </span>
  );
}
