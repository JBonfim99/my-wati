import { and, count, eq, sql } from "drizzle-orm";
import { coercePgDate } from "@/lib/campaigns/pg-timestamp";
import type { AppDb } from "@/lib/db";
import { campaignRecipients, campaigns, profiles } from "@/lib/db/schema";

export type CampaignRecipientBreakdown = {
  total: number;
  read: number;
  /** status = delivered (ainda não lido). */
  delivered: number;
  /** Enviado à API WhatsApp, sem delivered/read ainda. */
  sent: number;
  failed: number;
  /** Envio cancelado pelo utilizador (não conta como falha). */
  cancelled: number;
  /** pending + queued + sending */
  pending: number;
};

export type CampaignDetailBundle = {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  status: string;
  scheduledAt: Date | null;
  createdAt: Date;
  listId: number | null;
  templateComponents: unknown[] | null;
  createdBy: string | null;
  createdByLabel: string | null;
  firstSentAt: Date | null;
  breakdown: CampaignRecipientBreakdown;
};

export async function getCampaignDetailForTenant(
  db: AppDb,
  tenantId: number,
  campaignId: string,
): Promise<CampaignDetailBundle | null> {
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)))
    .limit(1);

  if (!c) return null;

  const [agg] = await db
    .select({
      total: count(campaignRecipients.id),
      read: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'read'), 0)::int`,
      delivered: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'delivered'), 0)::int`,
      sent: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'sent'), 0)::int`,
      failed: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'failed'), 0)::int`,
      cancelled: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'cancelled'), 0)::int`,
      pending: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} in ('pending', 'queued', 'sending')), 0)::int`,
    })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId));

  const [sentAgg] = await db
    .select({
      firstSentAt: sql<Date | null>`min(${campaignRecipients.updatedAt}) filter (where ${campaignRecipients.status} in ('sent', 'delivered', 'read'))`,
    })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId));

  let createdByLabel: string | null = null;
  if (c.createdBy) {
    const [p] = await db
      .select({
        displayName: profiles.displayName,
        email: profiles.email,
      })
      .from(profiles)
      .where(eq(profiles.id, c.createdBy))
      .limit(1);
    if (p) {
      const dn = p.displayName?.trim();
      createdByLabel =
        dn && dn.length > 0 ? dn : p.email?.trim() || null;
    }
  }

  const components = c.templateComponents;
  const templateComponents = Array.isArray(components)
    ? (components as unknown[])
    : null;

  return {
    id: c.id,
    name: c.name,
    templateName: c.templateName,
    templateLanguage: c.templateLanguage,
    status: c.status,
    scheduledAt: c.scheduledAt ?? null,
    createdAt: c.createdAt,
    listId: c.listId ?? null,
    templateComponents,
    createdBy: c.createdBy ?? null,
    createdByLabel,
    firstSentAt: coercePgDate(sentAgg?.firstSentAt),
    breakdown: {
      total: Number(agg?.total ?? 0),
      read: agg?.read ?? 0,
      delivered: agg?.delivered ?? 0,
      sent: agg?.sent ?? 0,
      failed: agg?.failed ?? 0,
      cancelled: agg?.cancelled ?? 0,
      pending: agg?.pending ?? 0,
    },
  };
}
