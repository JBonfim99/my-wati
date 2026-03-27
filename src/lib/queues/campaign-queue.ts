import { Queue } from "bullmq";
import { getQueueRedisConnection } from "@/lib/queues/redis-connection";

export const CAMPAIGN_QUEUE_NAME = "campaign-send";

export type CampaignSendJob = {
  recipientId: string;
  tenantId: number;
};

const globalForQueue = globalThis as unknown as {
  campaignQueue?: Queue<CampaignSendJob>;
};

export function getCampaignQueue(): Queue<CampaignSendJob> {
  if (globalForQueue.campaignQueue) return globalForQueue.campaignQueue;
  globalForQueue.campaignQueue = new Queue<CampaignSendJob>(CAMPAIGN_QUEUE_NAME, {
    connection: getQueueRedisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return globalForQueue.campaignQueue;
}
