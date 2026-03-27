import { Queue } from "bullmq";
import type { BulkContactsJob } from "@/lib/contacts/bulk-schema";
import { getQueueRedisConnection } from "@/lib/queues/redis-connection";

export const BULK_CONTACTS_QUEUE_NAME = "contacts-bulk";

const globalForBulkQueue = globalThis as unknown as {
  bulkContactsQueue?: Queue<BulkContactsJob>;
};

export function getBulkContactsQueue(): Queue<BulkContactsJob> {
  if (globalForBulkQueue.bulkContactsQueue) {
    return globalForBulkQueue.bulkContactsQueue;
  }
  globalForBulkQueue.bulkContactsQueue = new Queue<BulkContactsJob>(
    BULK_CONTACTS_QUEUE_NAME,
    {
      connection: getQueueRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 2000,
        removeOnFail: 5000,
      },
    },
  );
  return globalForBulkQueue.bulkContactsQueue;
}
