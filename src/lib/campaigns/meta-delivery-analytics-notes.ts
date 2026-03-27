/**
 * Como a Meta expõe “estatísticas de entrega” vs o que o my-wati já grava.
 *
 * 1) **Webhooks (Cloud API) — `messages` com `status`**
 *    Cada atualização de entrega vem no webhook com `status`: sent, delivered, read, failed
 *    (e metadados como `errors`). É a fonte por mensagem; o worker/webhook já atualiza
 *    `campaign_recipients.status` — ou seja, a distribuição na UI interna reflete isso.
 *
 * 2) **Graph API — Analytics / Conversation Analytics (WABA)**
 *    Endpoints agregados (ex.: conversation analytics no WhatsApp Business Account) devolvem
 *    séries por conversa, custo, tipo de conversa, etc., não o detalhe linha-a-linha de cada
 *    disparo de campanha. Útil para dashboards financeiros/operacionais na Meta, não substitui
 *    o armazenamento local por destinatário.
 *
 * 3) **Conclusão para “Estatísticas de Entrega” futuras**
 *    - Por destinatário / campanha: continuar derivando de `campaign_recipients` + histórico de
 *      webhook se precisarmos de timeline (aí sim nova tabela de eventos).
 *    - Agregados “oficiais” Meta: chamada Graph com token da integração + WABA ID, em job
 *      agendado ou sob demanda, guardando snapshot se quisermos comparar com o nosso DB.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/
 * @see https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/conversation_analytics/
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/analytics/
 */
export const META_DELIVERY_ANALYTICS_SUMMARY =
  "Webhook status → campaign_recipients; WABA conversation_analytics → agregados Meta (não por job).";
