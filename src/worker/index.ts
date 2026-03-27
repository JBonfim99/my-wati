import "dotenv/config";

import { UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  campaignRecipients,
  campaigns,
  tenantIntegrations,
} from "@/lib/db/schema";
import { syncCampaignFinishedStatus } from "@/lib/campaigns/sync-campaign-status";
import { decryptSecret } from "@/lib/crypto";
import { sendTemplateMessage } from "@/lib/meta/graph";
import {
  CAMPAIGN_QUEUE_NAME,
  type CampaignSendJob,
} from "@/lib/queues/campaign-queue";

/** Códigos Meta em que um novo envio com os mesmos dados pode ter sucesso (ex.: limite / throughput). */
const WHATSAPP_RETRYABLE_ERROR_CODES = new Set([
  4, // Application request limit (Facebook)
  130429, // Throughput / rate (WhatsApp Cloud API)
]);

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL missing");
  process.exit(1);
}

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker<CampaignSendJob>(
  CAMPAIGN_QUEUE_NAME,
  async (job) => {
    const { recipientId, tenantId: tenantIdRaw } = job.data;
    const tenantId =
      typeof tenantIdRaw === "number"
        ? tenantIdRaw
        : Number.parseInt(String(tenantIdRaw), 10);
    const db = getDb();

    const [recipient] = await db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.id, recipientId))
      .limit(1);

    if (
      !recipient ||
      !Number.isFinite(tenantId) ||
      recipient.tenantId !== tenantId
    ) {
      throw new Error("Recipient not found or tenant mismatch");
    }

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, recipient.campaignId))
      .limit(1);

    if (!campaign) throw new Error("Campaign not found");

    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(eq(tenantIntegrations.tenantId, tenantId))
      .limit(1);

    if (!integration) throw new Error("Integration not configured");

    const token = decryptSecret(integration.encryptedAccessToken);

    await db
      .update(campaignRecipients)
      .set({ status: "sending", attempts: recipient.attempts + 1 })
      .where(eq(campaignRecipients.id, recipientId));

    const result = await sendTemplateMessage(
      token,
      integration.phoneNumberId,
      {
        to: recipient.phoneE164,
        templateName: campaign.templateName,
        languageCode: campaign.templateLanguage,
        components: (campaign.templateComponents as unknown[]) ?? undefined,
      },
      integration.graphApiVersion,
    );

    if (!result.ok) {
      await db
        .update(campaignRecipients)
        .set({
          status: "failed",
          lastError: result.error,
          updatedAt: new Date(),
        })
        .where(eq(campaignRecipients.id, recipientId));

      await syncCampaignFinishedStatus(campaign.id);

      const code = result.errorCode;
      const retryable =
        code !== undefined && WHATSAPP_RETRYABLE_ERROR_CODES.has(code);
      if (retryable) {
        throw new Error(result.error);
      }
      throw new UnrecoverableError(result.error);
    }

    await db
      .update(campaignRecipients)
      .set({
        status: "sent",
        wamid: result.messageId,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(campaignRecipients.id, recipientId));

    await syncCampaignFinishedStatus(campaign.id);
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 3) },
);

worker.on("failed", (job, err) => {
  console.error("Job failed", job?.id, err);
});

worker.on("completed", (job) => {
  console.log("Job completed", job.id);
});

console.log("Campaign worker listening on", CAMPAIGN_QUEUE_NAME);
