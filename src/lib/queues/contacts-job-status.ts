import type { Job } from "bullmq";
import { bulkContactsJobSchema } from "@/lib/contacts/bulk-schema";
import { contactsImportJobSchema } from "@/lib/contacts/import-schema";
import { getBulkContactsQueue } from "@/lib/queues/bulk-contacts-queue";
import { getContactsImportQueue } from "@/lib/queues/contacts-import-queue";

/** Mesmo shape JSON dos GET `.../import/[jobId]` e `.../bulk/[jobId]`. */
export type ContactsQueueJobStatusJson =
  | {
      state: "failed";
      progress: unknown;
      failedReason: string | null;
    }
  | {
      state: "completed";
      progress: unknown;
      result: unknown;
    }
  | {
      state: string;
      progress: unknown;
    };

export async function jobToContactsQueueStatusJson(
  job: Job,
): Promise<ContactsQueueJobStatusJson> {
  const state = await job.getState();
  const progress = job.progress;
  if (state === "failed") {
    return {
      state,
      progress,
      failedReason: job.failedReason ?? null,
    };
  }
  if (state === "completed") {
    return {
      state,
      progress,
      result: job.returnvalue ?? null,
    };
  }
  return { state, progress };
}

export async function getContactsImportJobStatusForTenant(
  jobId: string,
  tenantId: number,
): Promise<
  | { ok: true; body: ContactsQueueJobStatusJson }
  | { ok: false; notFound: true }
> {
  const queue = getContactsImportQueue();
  const job = await queue.getJob(jobId);
  if (!job) return { ok: false, notFound: true };

  const parsed = contactsImportJobSchema.safeParse(job.data);
  if (!parsed.success || parsed.data.tenantId !== tenantId) {
    return { ok: false, notFound: true };
  }

  const body = await jobToContactsQueueStatusJson(job);
  return { ok: true, body };
}

export async function getBulkContactsJobStatusForTenant(
  jobId: string,
  tenantId: number,
): Promise<
  | { ok: true; body: ContactsQueueJobStatusJson }
  | { ok: false; notFound: true }
> {
  const queue = getBulkContactsQueue();
  const job = await queue.getJob(jobId);
  if (!job) return { ok: false, notFound: true };

  const parsed = bulkContactsJobSchema.safeParse(job.data);
  if (!parsed.success || parsed.data.tenantId !== tenantId) {
    return { ok: false, notFound: true };
  }

  const body = await jobToContactsQueueStatusJson(job);
  return { ok: true, body };
}
