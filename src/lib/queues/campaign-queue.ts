import { Queue } from "bullmq";
import IORedis from "ioredis";

export const CAMPAIGN_QUEUE_NAME = "campaign-send";

export type CampaignSendJob = {
  recipientId: string;
  tenantId: number;
};

let connection: IORedis | null = null;

function getRedis(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  if (!connection) {
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function getCampaignQueue() {
  return new Queue<CampaignSendJob>(CAMPAIGN_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}
