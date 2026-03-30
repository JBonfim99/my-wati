import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { campaignRecipients, campaigns } from "@/lib/db/schema";
import { removeQueuedRecipientJobs } from "@/lib/queues/campaign-job-remove";

export function campaignCanCancelQueue(
  campaignStatus: string,
  recipientRows: { status: string }[],
): boolean {
  if (campaignStatus === "scheduled") return true;
  if (campaignStatus === "queued") {
    return recipientRows.every(
      (r) => r.status === "queued" || r.status === "pending",
    );
  }
  return false;
}

export async function cancelCampaignQueue(
  db: AppDb,
  tenantId: number,
  campaignId: string,
): Promise<
  { ok: true } | { ok: false; reason: "not_found" | "not_allowed" }
> {
  const [c] = await db
    .select()
    .from(campaigns)
    .where(
      and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)),
    )
    .limit(1);

  if (!c) return { ok: false, reason: "not_found" };

  const recs = await db
    .select({
      id: campaignRecipients.id,
      status: campaignRecipients.status,
    })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId));

  if (!campaignCanCancelQueue(c.status, recs)) {
    return { ok: false, reason: "not_allowed" };
  }

  await removeQueuedRecipientJobs(recs.map((r) => r.id));

  await db.transaction(async (tx) => {
    await tx
      .update(campaignRecipients)
      .set({
        status: "cancelled",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(campaignRecipients.campaignId, campaignId));

    await tx
      .update(campaigns)
      .set({ status: "cancelled" })
      .where(
        and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)),
      );
  });

  return { ok: true };
}
