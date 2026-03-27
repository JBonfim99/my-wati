import { sql } from "drizzle-orm";
import { campaignRecipients, campaigns } from "@/lib/db/schema";

/**
 * Subconsulta escalar: primeiro instante em que algum destinatário da campanha
 * ficou em sent / delivered / read (aproxima “quando começou a enviar com sucesso”).
 */
export function campaignFirstSentAtSql() {
  return sql<Date | null>`(
    select min(${campaignRecipients.updatedAt})
    from ${campaignRecipients}
    where ${campaignRecipients.campaignId} = ${campaigns.id}
    and ${campaignRecipients.status} in ('sent', 'delivered', 'read')
  )`;
}
