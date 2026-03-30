import "dotenv/config";

import { UnrecoverableError, Worker } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { processBulkContactsJob } from "@/lib/contacts/bulk-job-processor";
import type { BulkContactsJob } from "@/lib/contacts/bulk-schema";
import { processContactsImportJob } from "@/lib/contacts/import-job-processor";
import type { ContactsImportJob } from "@/lib/contacts/import-schema";
import { getDb } from "@/lib/db";
import {
  campaignRecipients,
  campaigns,
  tenantIntegrations,
} from "@/lib/db/schema";
import { syncCampaignFinishedStatus } from "@/lib/campaigns/sync-campaign-status";
import { decryptSecret } from "@/lib/crypto";
import { sendTemplateMessage } from "@/lib/meta/graph";
import { BULK_CONTACTS_QUEUE_NAME } from "@/lib/queues/bulk-contacts-queue";
import { CONTACTS_IMPORT_QUEUE_NAME } from "@/lib/queues/contacts-import-queue";
import {
  CAMPAIGN_QUEUE_NAME,
  type CampaignSendJob,
} from "@/lib/queues/campaign-queue";
import { getQueueRedisConnection } from "@/lib/queues/redis-connection";

/** Meta error codes where retrying the same payload may succeed (rate / throughput). */
const WHATSAPP_RETRYABLE_ERROR_CODES = new Set([
  4,      // Application request limit (Facebook)
  130429, // Throughput / rate limit (WhatsApp Cloud API)
]);

let connection: ReturnType<typeof getQueueRedisConnection>;
try {
  connection = getQueueRedisConnection();
} catch {
  console.error("REDIS_URL missing");
  process.exit(1);
}

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

    if (recipient.status === "cancelled") {
      return;
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

    await db
      .update(campaigns)
      .set({ status: "sending" })
      .where(
        and(
          eq(campaigns.id, campaignRow.id),
          inArray(campaigns.status, ["queued", "scheduled"]),
        ),
      );

    const token = decryptSecret(integrationRow.encryptedAccessToken);

    await db
      .update(campaignRecipients)
      .set({ status: "sending", attempts: recipient.attempts + 1 })
      .where(eq(campaignRecipients.id, recipientId));

    // Não enviar `template_components` da BD: vêm do GET message_templates (definição:
    // text, format, example, …). Na Cloud API de envio só cabem componentes com
    // `parameters` (valores das variáveis). Incluir a definição causa (#100) Unexpected key "text".
    // Modelo sem variáveis: omitir `components`. Com variáveis: futuro mapeamento na criação da campanha.
    const result = await sendTemplateMessage(
      token,
      integrationRow.phoneNumberId,
      {
        to: recipient.phoneE164,
        templateName: campaignRow.templateName,
        languageCode: campaignRow.templateLanguage,
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
  console.error("Campaign job failed", job?.id, err);
});

worker.on("completed", (job) => {
  console.log("Campaign job completed", job.id);
});

const bulkWorker = new Worker<BulkContactsJob>(
  BULK_CONTACTS_QUEUE_NAME,
  async (job) => processBulkContactsJob(job),
  {
    connection,
    concurrency: Number(process.env.BULK_WORKER_CONCURRENCY ?? 1),
  },
);

bulkWorker.on("failed", (job, err) => {
  console.error("Bulk contacts job failed", job?.id, err);
});

bulkWorker.on("completed", (job) => {
  console.log("Bulk contacts job completed", job.id);
});

const importWorker = new Worker<ContactsImportJob>(
  CONTACTS_IMPORT_QUEUE_NAME,
  async (job) => processContactsImportJob(job),
  {
    connection,
    concurrency: Number(process.env.IMPORT_WORKER_CONCURRENCY ?? 1),
  },
);

importWorker.on("failed", (job, err) => {
  console.error("Contacts import job failed", job?.id, err);
});

importWorker.on("completed", (job) => {
  console.log("Contacts import job completed", job.id);
});

console.log("Campaign worker listening on", CAMPAIGN_QUEUE_NAME);
console.log("Bulk contacts worker listening on", BULK_CONTACTS_QUEUE_NAME);
console.log("Contacts import worker listening on", CONTACTS_IMPORT_QUEUE_NAME);
