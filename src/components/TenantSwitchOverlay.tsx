"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Building2 } from "lucide-react";

type Props = {
  pendingTenantId: string | null;
  onDone: () => void;
};

function tenantSegmentFromPathname(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const seg = parts[0];
  if (!seg || !/^\d+$/.test(seg)) return null;
  return seg;
}

export function TenantSwitchOverlay({ pendingTenantId, onDone }: Props) {
  const pathname = usePathname();
  const t = useTranslations("app.shell");
  const [exiting, setExiting] = useState(false);
  const failSafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    handledRef.current = false;
    setExiting(false);
  }, [pendingTenantId]);

  useEffect(() => {
    if (!pendingTenantId) return;
    failSafeRef.current = setTimeout(() => {
      onDone();
    }, 12_000);
    return () => {
      if (failSafeRef.current) clearTimeout(failSafeRef.current);
    };
  }, [pendingTenantId, onDone]);

  useEffect(() => {
    if (!pendingTenantId || handledRef.current) return;
    const seg = tenantSegmentFromPathname(pathname);
    if (seg === pendingTenantId) {
      handledRef.current = true;
      if (failSafeRef.current) {
        clearTimeout(failSafeRef.current);
        failSafeRef.current = null;
      }
      setExiting(true);
      exitTimerRef.current = setTimeout(() => {
        setExiting(false);
        onDone();
      }, 320);
    }
  }, [pathname, pendingTenantId, onDone]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  if (!pendingTenantId) return null;

  return (
    <div
      className={`tenant-switch-overlay fixed inset-0 z-[200] flex items-center justify-center bg-page/88 backdrop-blur-md transition-opacity duration-300 ${
        exiting ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-live="polite"
      aria-busy={!exiting}
    >
      <div
        className={`flex max-w-sm flex-col items-center gap-5 px-8 text-center transition duration-300 ${
          exiting
            ? "translate-y-1 scale-95 opacity-0"
            : "translate-y-0 scale-100 opacity-100"
        }`}
      >
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-lg ring-1 ring-border">
          <span
            className="pointer-events-none absolute -inset-0.5 z-0 rounded-[14px] border-2 border-primary-100 border-t-primary-500 animate-spin"
            aria-hidden
          />
          <Building2
            className="relative z-[1] h-8 w-8 animate-pulse text-primary-600"
            strokeWidth={1.5}
            aria-hidden
          />
        </div>
        <div>
          <p className="font-display text-base font-semibold text-fg">
            {t("tenantSwitchingTitle")}
          </p>
          <p className="mt-1 text-sm text-fg-secondary">
            {t("tenantSwitchingHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
