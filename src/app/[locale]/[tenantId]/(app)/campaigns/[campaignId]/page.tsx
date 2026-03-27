import { notFound } from "next/navigation";
import { z } from "zod";
import { fetchTemplateComponentsForCampaignPreview } from "@/lib/campaigns/fetch-template-components";
import { getCampaignDetailForTenant } from "@/lib/campaigns/detail-queries";
import { getDb } from "@/lib/db";
import {
  getCachedTenantSession,
  parseTenantIdFromParam,
} from "@/lib/session";
import { CampaignDetailPageClient } from "../_components/CampaignDetailPageClient";

type Props = { params: Promise<{ tenantId: string; campaignId: string }> };

const uuidParam = z.string().uuid();

export default async function CampaignDetailPage({ params }: Props) {
  const { tenantId: tp, campaignId: rawId } = await params;
  const tenantId = parseTenantIdFromParam(tp);
  if (tenantId === null) notFound();

  const parsedId = uuidParam.safeParse(rawId);
  if (!parsedId.success) notFound();

  const ctx = await getCachedTenantSession(tenantId);
  if (!ctx) notFound();

  const db = getDb();
  const detail = await getCampaignDetailForTenant(
    db,
    tenantId,
    parsedId.data,
  );
  if (!detail) notFound();

  let templateComponents = detail.templateComponents;
  if (!templateComponents?.length) {
    try {
      const fromGraph = await fetchTemplateComponentsForCampaignPreview(
        db,
        tenantId,
        detail.templateName,
        detail.templateLanguage,
      );
      if (fromGraph?.length) templateComponents = fromGraph;
    } catch {
      /* preview fica vazio se Graph falhar */
    }
  }

  return (
    <CampaignDetailPageClient
      tenantId={tp}
      detail={{
        id: detail.id,
        name: detail.name,
        templateName: detail.templateName,
        templateLanguage: detail.templateLanguage,
        status: detail.status,
        scheduledAt: detail.scheduledAt?.toISOString() ?? null,
        createdAt: detail.createdAt.toISOString(),
        listId: detail.listId,
        templateComponents,
        createdByLabel: detail.createdByLabel,
        firstSentAt: detail.firstSentAt?.toISOString() ?? null,
        breakdown: detail.breakdown,
      }}
    />
  );
}
