import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { campaignRecipients, campaigns } from "@/lib/db/schema";

/**
 * Quando todos os destinatários saíram de pending/queued/sending, define a campanha como
 * `failed` (todos falharam) ou `completed` (houve pelo menos um envio bem-sucedido ou entrega/leitura).
 */
export async function syncCampaignFinishedStatus(campaignId: string): Promise<void> {
  const db = getDb();

  const rows = await db
    .select({ status: campaignRecipients.status })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId));

  if (rows.length === 0) return;

  const inFlight = new Set(["pending", "queued", "sending"]);
  if (rows.some((r) => inFlight.has(r.status))) return;

  const failed = rows.filter((r) => r.status === "failed").length;
  const next: "completed" | "failed" =
    failed === rows.length ? "failed" : "completed";

  await db
    .update(campaigns)
    .set({ status: next })
    .where(
      and(
        eq(campaigns.id, campaignId),
        inArray(campaigns.status, ["queued", "scheduled", "sending"]),
      ),
    );
}
