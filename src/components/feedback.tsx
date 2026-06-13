"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, AlertTriangle } from "lucide-react";

type Tone = "danger" | "default";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}

interface FeedbackContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, tone?: "success" | "error") => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useConfirm must be used within <FeedbackProvider>");
  return ctx.confirm;
}

export function useToast() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useToast must be used within <FeedbackProvider>");
  return ctx.toast;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(opts);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  }, []);

  const toast = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      counter.current += 1;
      const id = counter.current;
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        2800
      );
    },
    []
  );

  // Keyboard: Enter confirms, Escape cancels, while a dialog is open.
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") settle(true);
      else if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, settle]);

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}

      {request && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
          onClick={() => settle(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4"
          >
            <div>
              <h3 className="font-bold text-lg">{request.title}</h3>
              {request.message && (
                <p className="mt-1 text-sm text-gray-500">{request.message}</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => settle(false)}
                className="rounded-[0.625rem] border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
              >
                {request.cancelLabel ?? "Cancel"}
              </button>
              <button
                autoFocus
                onClick={() => settle(true)}
                className={`rounded-[0.625rem] px-4 py-2 font-semibold text-white ${
                  request.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "btn-brand !py-2"
                }`}
              >
                {request.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-5 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg flex items-center gap-2 ${
                t.tone === "error" ? "bg-red-600" : "bg-gray-900"
              }`}
            >
              {t.tone === "error" ? (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              ) : (
                <Check className="h-4 w-4 shrink-0" />
              )}
              {t.message}
            </div>
          ))}
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
