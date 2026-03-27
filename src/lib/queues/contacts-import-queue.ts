import { Queue } from "bullmq";
import type { ContactsImportJob } from "@/lib/contacts/import-schema";
import { getQueueRedisConnection } from "@/lib/queues/redis-connection";

export const CONTACTS_IMPORT_QUEUE_NAME = "contacts-import";

const globalForImportQueue = globalThis as unknown as {
  contactsImportQueue?: Queue<ContactsImportJob>;
};

export function getContactsImportQueue(): Queue<ContactsImportJob> {
  if (globalForImportQueue.contactsImportQueue) {
    return globalForImportQueue.contactsImportQueue;
  }
  globalForImportQueue.contactsImportQueue = new Queue<ContactsImportJob>(
    CONTACTS_IMPORT_QUEUE_NAME,
    {
      connection: getQueueRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 8000 },
        removeOnComplete: 500,
        removeOnFail: 2000,
      },
    },
  );
  return globalForImportQueue.contactsImportQueue;
}
