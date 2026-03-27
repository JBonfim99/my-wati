"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { parseTenantIdFromParam } from "@/lib/tenant-id-param";

export function NotFoundGoHomeButton() {
  const t = useTranslations("app.notFound");
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function goHome() {
    const m = pathname.match(/^\/(\d+)(?:\/|$)/);
    const segment = m?.[1];
    if (segment) {
      const tid = parseTenantIdFromParam(segment);
      if (tid !== null) {
        router.push(`/${tid}/dashboard`);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/me/home-redirect");
      if (!res.ok) {
        router.push("/select-tenant");
        return;
      }
      const data = (await res.json()) as { path?: string };
      router.push(typeof data.path === "string" ? data.path : "/select-tenant");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void goHome()}
      disabled={loading}
      className="ds-btn-primary ds-btn-sm min-w-[10rem] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? t("goHomeLoading") : t("goHome")}
    </button>
  );
}
