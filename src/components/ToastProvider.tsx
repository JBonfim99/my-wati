"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AlertTriangle, CheckCircle, X, XCircle } from "lucide-react";

export type ToastType = "success" | "warning" | "error";

type ToastItem = { id: string; type: ToastType; message: string };

type ToastApi = {
  success: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<{ toast: ToastApi } | null>(null);

const TOAST_MS = 6000;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast deve ser usado dentro de ToastProvider");
  }
  return ctx.toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const toast = useMemo<ToastApi>(
    () => ({
      success: (message: string) => push("success", message),
      warning: (message: string) => push("warning", message),
      error: (message: string) => push("error", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(100vw-2rem,22rem)] flex-col gap-2 sm:bottom-6 sm:right-6"
        aria-live="polite"
      >
        {items.map((t) => {
          const base =
            "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm";
          const styles =
            t.type === "success"
              ? "border-emerald-200/80 bg-emerald-50/95 text-emerald-950"
              : t.type === "warning"
                ? "border-amber-200/80 bg-amber-50/95 text-amber-950"
                : "border-red-200/80 bg-red-50/95 text-red-950";
          const Icon =
            t.type === "success"
              ? CheckCircle
              : t.type === "warning"
                ? AlertTriangle
                : XCircle;
          return (
            <div key={t.id} className={`${base} ${styles}`} role="status">
              <Icon className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden />
              <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100"
                onClick={() => dismiss(t.id)}
                aria-label="Fechar"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
