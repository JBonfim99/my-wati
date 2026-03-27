import { getTranslations } from "next-intl/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { campaigns, campaignRecipients } from "@/lib/db/schema";
import {
  getCachedTenantSession,
  parseTenantIdFromParam,
} from "@/lib/session";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const t = await getTranslations("app.dashboard");
  const { tenantId: tp } = await params;
  const tenantId = parseTenantIdFromParam(tp);
  if (tenantId === null) return null;
  const ctx = await getCachedTenantSession(tenantId);
  if (!ctx) return null;
  const db = getDb();

  const campaignRows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.tenantId, ctx.tenantId));

  const stats = await db
    .select({
      status: campaignRecipients.status,
      c: sql<number>`count(*)::int`,
    })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.tenantId, ctx.tenantId))
    .groupBy(campaignRecipients.status);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="ds-page-title">{t("title")}</h1>
        <p className="ds-subtitle mt-1">{t("subtitle")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Campanhas"
          value={campaignRows.length}
          delayMs={0}
          accent="indigo"
        />
        {stats.map((s, i) => (
          <Stat
            key={s.status}
            label={`Recipients: ${s.status}`}
            value={s.c}
            delayMs={(i + 1) * 60}
            accent="whatsapp"
          />
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  delayMs,
  accent,
}: {
  label: string;
  value: number;
  delayMs: number;
  accent: "indigo" | "whatsapp";
}) {
  return (
    <div
      className="ds-card ds-animate-in p-5"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </div>
      <div
        className={`mt-2 font-display text-3xl font-bold tracking-tight ${
          accent === "whatsapp" ? "text-whatsapp" : "text-primary-600"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
