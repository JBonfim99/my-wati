import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { getSessionUser, listMembershipsForUser } from "@/lib/session";
import { ensureProfile } from "@/lib/profile";
import { setActiveTenant } from "./actions";
import { AutoSetTenant } from "@/components/AutoSetTenant";
import { Building2, ChevronRight } from "lucide-react";

export default async function SelectTenantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  const t = await getTranslations("app.selectTenant");
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  await ensureProfile(user);

  const memberships = await listMembershipsForUser(user.id);
  if (memberships.length === 0) {
    return (
      <div className="ds-auth-shell flex min-h-screen items-center justify-center p-6">
        <div className="ds-alert-warning max-w-md text-center">
          {t("noMemberships")}
        </div>
      </div>
    );
  }

  if (memberships.length === 1) {
    return (
      <div className="ds-auth-shell flex min-h-screen items-center justify-center">
        <AutoSetTenant tenantId={memberships[0].tenantId} />
      </div>
    );
  }

  const db = getDb();
  const ids = memberships.map((m) => m.tenantId);
  const tenantRows = await db
    .select()
    .from(tenants)
    .where(inArray(tenants.id, ids));

  return (
    <div className="ds-auth-shell flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="ds-page-title">{t("title")}</h1>
        <p className="ds-subtitle mt-2">{t("subtitle")}</p>
      </div>
      <ul className="flex w-full max-w-md flex-col gap-3">
        {tenantRows.map((tenantRow) => (
          <li key={tenantRow.id}>
            <form action={setActiveTenant}>
              <input type="hidden" name="tenantId" value={String(tenantRow.id)} />
              <button
                type="submit"
                className="group ds-card flex w-full items-center justify-between gap-4 p-4 text-left transition-shadow duration-200 hover:border-primary-600/40 hover:shadow-md"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Building2 className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <span>
                    <span className="block font-semibold text-fg">{tenantRow.name}</span>
                    <span className="text-sm text-fg-muted">{tenantRow.slug}</span>
                  </span>
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600"
                  strokeWidth={1.5}
                />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
