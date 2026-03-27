"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { BadgeCheck, Building2 } from "lucide-react";

export type TenantOption = { id: string; name: string; slug: string };

type Props = {
  tenants: TenantOption[];
  currentTenantId: string;
  whatsappConnected: boolean;
  onBeginTenantSwitch?: (tenantId: string) => void;
  onNavigate?: () => void;
};

function isNumericTenantSegment(s: string): boolean {
  return /^\d+$/.test(s);
}

export function TenantSelector({
  tenants,
  currentTenantId,
  whatsappConnected,
  onBeginTenantSwitch,
  onNavigate,
}: Props) {
  const t = useTranslations("app.nav");
  const router = useRouter();
  const pathname = usePathname();

  if (tenants.length === 0) return null;

  function navigateToTenant(tenantId: string) {
    if (tenantId === currentTenantId) return;
    onBeginTenantSwitch?.(tenantId);
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
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium text-fg shadow-sm">
          <Building2
            className="h-4 w-4 shrink-0 text-primary-600"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{tenants[0].name}</span>
          {whatsappConnected ? (
            <BadgeCheck
              className="h-4 w-4 shrink-0 text-green-600"
              strokeWidth={2}
              aria-label={t("whatsappVerified")}
            />
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1 rounded-xl border border-border bg-card px-2 py-1 shadow-sm">
          <Building2
            className="ml-1 h-4 w-4 shrink-0 text-primary-600"
            strokeWidth={1.5}
            aria-hidden
          />
          <select
            className="ds-select !mt-0 min-w-0 flex-1 border-0 bg-transparent py-2 pl-0 pr-1 text-sm shadow-none focus:ring-0"
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
          {whatsappConnected ? (
            <BadgeCheck
              className="mr-1 h-4 w-4 shrink-0 text-green-600"
              strokeWidth={2}
              aria-label={t("whatsappVerified")}
            />
          ) : null}
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
