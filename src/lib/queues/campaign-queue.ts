import { Queue } from "bullmq";
import IORedis from "ioredis";

export const CAMPAIGN_QUEUE_NAME = "campaign-send";

export type CampaignSendJob = {
  recipientId: string;
  tenantId: number;
};

const globalForQueue = globalThis as unknown as {
  redisConnection?: IORedis;
  campaignQueue?: Queue<CampaignSendJob>;
};

function getRedis(): IORedis {
  if (globalForQueue.redisConnection) return globalForQueue.redisConnection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  globalForQueue.redisConnection = new IORedis(url, { maxRetriesPerRequest: null });
  return globalForQueue.redisConnection;
}

export function getCampaignQueue(): Queue<CampaignSendJob> {
  if (globalForQueue.campaignQueue) return globalForQueue.campaignQueue;
  globalForQueue.campaignQueue = new Queue<CampaignSendJob>(CAMPAIGN_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return globalForQueue.campaignQueue;
}
