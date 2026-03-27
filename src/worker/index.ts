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

/** Meta error codes where retrying the same payload may succeed (rate / throughput). */
const WHATSAPP_RETRYABLE_ERROR_CODES = new Set([
  4,      // Application request limit (Facebook)
  130429, // Throughput / rate limit (WhatsApp Cloud API)
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

    if (!Number.isFinite(tenantId)) {
      throw new UnrecoverableError("Invalid tenantId in job");
    }

    const db = getDb();

    // Fetch recipient first (need campaignId from it)
    const [recipient] = await db
      .select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.id, recipientId))
      .limit(1);

    if (!recipient || recipient.tenantId !== tenantId) {
      throw new UnrecoverableError("Recipient not found or tenant mismatch");
    }

    // Fetch campaign and integration in parallel
    const [campaignRow, integrationRow] = await Promise.all([
      db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, recipient.campaignId))
        .limit(1)
        .then((r) => r[0]),
      db
        .select()
        .from(tenantIntegrations)
        .where(eq(tenantIntegrations.tenantId, tenantId))
        .limit(1)
        .then((r) => r[0]),
    ]);

    if (!campaignRow) throw new UnrecoverableError("Campaign not found");
    if (!integrationRow) throw new UnrecoverableError("Integration not configured");

    const token = decryptSecret(integrationRow.encryptedAccessToken);

    await db
      .update(campaignRecipients)
      .set({ status: "sending", attempts: recipient.attempts + 1 })
      .where(eq(campaignRecipients.id, recipientId));

    const result = await sendTemplateMessage(
      token,
      integrationRow.phoneNumberId,
      {
        to: recipient.phoneE164,
        templateName: campaignRow.templateName,
        languageCode: campaignRow.templateLanguage,
        components: (campaignRow.templateComponents as unknown[]) ?? undefined,
      },
      integrationRow.graphApiVersion,
    );

    if (!result.ok) {
      await db
        .update(campaignRecipients)
        .set({ status: "failed", lastError: result.error, updatedAt: new Date() })
        .where(eq(campaignRecipients.id, recipientId));

      await syncCampaignFinishedStatus(campaignRow.id);

      const retryable =
        result.errorCode !== undefined &&
        WHATSAPP_RETRYABLE_ERROR_CODES.has(result.errorCode);
      if (retryable) throw new Error(result.error);
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

    await syncCampaignFinishedStatus(campaignRow.id);
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
