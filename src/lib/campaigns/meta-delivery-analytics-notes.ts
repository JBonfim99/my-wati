/**
 * Como a Meta expõe “estatísticas de entrega” vs o que o my-wati já grava.
 *
 * 1) **Webhooks (Cloud API) — `messages` com `status`**
 *    Cada atualização de entrega vem no webhook com `status`: sent, delivered, read, failed
 *    (e opcionalmente `played` para áudio). É a fonte por mensagem; o webhook atualiza
 *    `campaign_recipients` e grava cada callback em `whatsapp_delivery_events` (payload bruto
 *    + `delivery_status`) para auditoria / timeline.
 *
 * 1b) **Quick reply (botão de resposta rápida em template)**
 *     Quando o utilizador toca num quick reply, a Meta envia `messages` com `type: "button"` e
 *     `context.id` = wamid da mensagem do template. O webhook grava `source: user_button` em
 *     `whatsapp_delivery_events` (não altera o estado de entrega do destinatário).
 *
 * 1c) **Clique em botão URL (“Visit website”) em templates de marketing**
 *     Não aparece no mesmo payload que `status: sent|delivered|read`. A Meta documenta
 *     “Track click events” para mensagens de marketing (URLs rastreadas / métricas à parte).
 *     @see https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/track-click-events/
 *     Para contar cliques por destinatário no nosso produto: ou subscrever o fluxo oficial de
 *     click tracking da Meta (quando disponível para a vossa app/WABA), ou usar URL própria
 *     com query params únicos por envio e analisar no vosso analytics.
 *
 * 2) **Graph API — Analytics / Conversation Analytics (WABA)**
 *    Endpoints agregados (ex.: conversation analytics no WhatsApp Business Account) devolvem
 *    séries por conversa, custo, tipo de conversa, etc., não o detalhe linha-a-linha de cada
 *    disparo de campanha. Útil para dashboards financeiros/operacionais na Meta, não substitui
 *    o armazenamento local por destinatário.
 *
 * 3) **Conclusão para “Estatísticas de Entrega” futuras**
 *    - Por destinatário / campanha: `campaign_recipients` (último estado) + `whatsapp_delivery_events`
 *      (histórico de webhooks e quick replies).
 *    - Agregados “oficiais” Meta: chamada Graph com token da integração + WABA ID, em job
 *      agendado ou sob demanda, guardando snapshot se quisermos comparar com o nosso DB.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/
 * @see https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/conversation_analytics/
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/analytics/
 */
export const META_DELIVERY_ANALYTICS_SUMMARY =
  "Webhooks → campaign_recipients + whatsapp_delivery_events; cliques URL em marketing via doc Meta “track click events”; Graph analytics → agregados.";
