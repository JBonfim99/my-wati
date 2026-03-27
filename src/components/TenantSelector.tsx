"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Building2 } from "lucide-react";

export type TenantOption = { id: string; name: string; slug: string };

type Props = {
  tenants: TenantOption[];
  currentTenantId: string;
  onNavigate?: () => void;
};

function isNumericTenantSegment(s: string): boolean {
  return /^\d+$/.test(s);
}

export function TenantSelector({
  tenants,
  currentTenantId,
  onNavigate,
}: Props) {
  const t = useTranslations("app.nav");
  const router = useRouter();
  const pathname = usePathname();

  if (tenants.length === 0) return null;

  function navigateToTenant(tenantId: string) {
    if (tenantId === currentTenantId) return;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 1 && isNumericTenantSegment(parts[0])) {
      parts[0] = tenantId;
      router.push(`/${parts.join("/")}`);
    } else {
      router.push(`/${tenantId}/dashboard`);
    }
    onNavigate?.();
  }

  return (
    <div className="mb-6 px-2">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        {t("organization")}
      </p>
      {tenants.length === 1 ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium text-fg shadow-sm">
          <Building2
            className="h-4 w-4 shrink-0 text-primary-600"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="truncate">{tenants[0].name}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1 shadow-sm">
          <Building2
            className="ml-1 h-4 w-4 shrink-0 text-primary-600"
            strokeWidth={1.5}
            aria-hidden
          />
          <select
            className="ds-select !mt-0 min-w-0 flex-1 border-0 bg-transparent py-2 text-sm shadow-none focus:ring-0"
            value={currentTenantId}
            onChange={(e) => navigateToTenant(e.target.value)}
            aria-label={t("switchOrganization")}
          >
            {tenants.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {tenants.length > 1 ? (
        <p className="mt-1.5 px-1 text-[11px] text-fg-muted">
          {t("switchOrganizationHint")}
        </p>
      ) : null}
    </div>
  );
}
