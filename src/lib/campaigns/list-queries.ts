import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  sql,
} from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { campaignFirstSentAtSql } from "@/lib/campaigns/first-sent-at";
import { coercePgDate } from "@/lib/campaigns/pg-timestamp";
import { campaignRecipients, campaigns } from "@/lib/db/schema";

export type CampaignListRow = {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  status: string;
  /** Primeiro envio com sucesso (sent+), se houver. */
  firstSentAt: Date | null;
  scheduledAt: Date | null;
  totalRecipients: number;
  sentOk: number;
  readCount: number;
  failedCount: number;
};

export type CampaignPeriodMetrics = {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  /** Destinatários ainda em pending ou sending */
  processing: number;
  /** Destinatários em fila Bull (queued) */
  queued: number;
  /** Total de linhas de destinatário nas campanhas cujo primeiro envio cai no período. */
  totalRecipients: number;
};

function endOfDayUtc(isoDate: string): Date {
  const d = new Date(`${isoDate}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

export async function getCampaignPeriodMetrics(
  db: AppDb,
  tenantId: number,
  fromDate: string,
  toDate: string,
): Promise<CampaignPeriodMetrics> {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = endOfDayUtc(toDate);
  if (Number.isNaN(from.getTime())) {
    return {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      processing: 0,
      queued: 0,
      totalRecipients: 0,
    };
  }

  const fsAt = campaignFirstSentAtSql();

  const [row] = await db
    .select({
      sent: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} in ('sent', 'delivered', 'read')), 0)::int`,
      delivered: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} in ('delivered', 'read')), 0)::int`,
      read: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'read'), 0)::int`,
      failed: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'failed'), 0)::int`,
      processing: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} in ('pending', 'sending')), 0)::int`,
      queued: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'queued'), 0)::int`,
      totalRecipients: count(campaignRecipients.id),
    })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .where(
      and(
        eq(campaigns.tenantId, tenantId),
        sql`${fsAt} is not null`,
        sql`${fsAt} >= ${from.toISOString()}`,
        sql`${fsAt} <= ${to.toISOString()}`,
      ),
    );

  return {
    sent: row?.sent ?? 0,
    delivered: row?.delivered ?? 0,
    read: row?.read ?? 0,
    failed: row?.failed ?? 0,
    processing: row?.processing ?? 0,
    queued: row?.queued ?? 0,
    totalRecipients: Number(row?.totalRecipients ?? 0),
  };
}

export type CampaignListFilters = {
  from?: string;
  to?: string;
  status?: string;
  q?: string;
  /** Substring do nome do template (ilike). */
  template?: string;
  page: number;
  pageSize: number;
};

export async function listCampaignsPaginated(
  db: AppDb,
  tenantId: number,
  filters: CampaignListFilters,
): Promise<{ rows: CampaignListRow[]; total: number }> {
  const { page, pageSize } = filters;
  const offset = Math.max(0, (page - 1) * pageSize);

  const parts = [eq(campaigns.tenantId, tenantId)];
  const fsAt = campaignFirstSentAtSql();

  if (filters.from) {
    const f = new Date(`${filters.from}T00:00:00.000Z`);
    if (!Number.isNaN(f.getTime())) {
      parts.push(sql`${fsAt} >= ${f.toISOString()}`);
    }
  }
  if (filters.to) {
    const end = endOfDayUtc(filters.to);
    parts.push(sql`${fsAt} <= ${end.toISOString()}`);
  }
  if (
    filters.status &&
    ["draft", "queued", "sending", "completed", "failed"].includes(filters.status)
  ) {
    parts.push(
      eq(
        campaigns.status,
        filters.status as
          | "draft"
          | "queued"
          | "sending"
          | "completed"
          | "failed",
      ),
    );
  }
  if (filters.q?.trim()) {
    parts.push(ilike(campaigns.name, `%${filters.q.trim()}%`));
  }
  if (filters.template?.trim()) {
    parts.push(ilike(campaigns.templateName, `%${filters.template.trim()}%`));
  }

  const whereClause = and(...parts);

  const [countRow] = await db
    .select({ c: count() })
    .from(campaigns)
    .where(whereClause);

  const total = Number(countRow?.c ?? 0);

  const idRows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(whereClause)
    .orderBy(sql`${fsAt} desc nulls last`, desc(campaigns.createdAt))
    .limit(pageSize)
    .offset(offset);

  const ids = idRows.map((r) => r.id);
  if (ids.length === 0) {
    return { rows: [], total };
  }

  const stats = await db
    .select({
      campaignId: campaignRecipients.campaignId,
      totalRecipients: count(campaignRecipients.id),
      sentOk: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} in ('sent', 'delivered', 'read')), 0)::int`,
      readCount: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'read'), 0)::int`,
      failedCount: sql<number>`coalesce(count(*) filter (where ${campaignRecipients.status} = 'failed'), 0)::int`,
    })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .where(
      and(eq(campaigns.tenantId, tenantId), inArray(campaignRecipients.campaignId, ids)),
    )
    .groupBy(campaignRecipients.campaignId);

  const statMap = new Map(stats.map((s) => [s.campaignId, s]));

  const baseRows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      templateName: campaigns.templateName,
      templateLanguage: campaigns.templateLanguage,
      status: campaigns.status,
      firstSentAt: fsAt,
      scheduledAt: campaigns.scheduledAt,
    })
    .from(campaigns)
    .where(inArray(campaigns.id, ids));

  const orderIndex = new Map(ids.map((id, i) => [id, i]));
  baseRows.sort(
    (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
  );

  const rows: CampaignListRow[] = baseRows.map((c) => {
    const s = statMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      templateName: c.templateName,
      templateLanguage: c.templateLanguage,
      status: c.status,
      firstSentAt: coercePgDate(c.firstSentAt),
      scheduledAt: c.scheduledAt ?? null,
      totalRecipients: s?.totalRecipients ?? 0,
      sentOk: s?.sentOk ?? 0,
      readCount: s?.readCount ?? 0,
      failedCount: s?.failedCount ?? 0,
    };
  });

  return { rows, total };
}

export async function listDistinctCampaignTemplateNames(
  db: AppDb,
  tenantId: number,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: campaigns.templateName })
    .from(campaigns)
    .where(eq(campaigns.tenantId, tenantId))
    .orderBy(asc(campaigns.templateName));
  return rows.map((r) => r.name).filter((n) => n.trim().length > 0);
}
