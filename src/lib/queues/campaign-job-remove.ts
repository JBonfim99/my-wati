import { getCampaignQueue } from "@/lib/queues/campaign-queue";

const CANCELABLE_STATES = new Set(["delayed", "waiting", "paused"]);

/**
 * Remove jobs BullMQ ainda não processados (recipient jobId = UUID do destinatário).
 */
export async function removeQueuedRecipientJobs(
  recipientIds: string[],
): Promise<void> {
  const queue = getCampaignQueue();
  for (const id of recipientIds) {
    const job = await queue.getJob(id);
    if (!job) continue;
    const state = await job.getState();
    if (CANCELABLE_STATES.has(state)) {
      await job.remove();
    }
  }
}
