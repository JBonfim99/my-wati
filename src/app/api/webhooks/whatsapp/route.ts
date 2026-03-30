import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  campaignRecipients,
  tenantIntegrations,
  whatsappDeliveryEvents,
} from "@/lib/db/schema";
import { wabaTemplatesCacheTag } from "@/lib/meta/cached-templates";
import { upsertWabaTemplateStatusSnapshot } from "@/lib/templates/waba-template-snapshot-queries";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.webhookVerifyToken, token))
    .limit(1);

  if (!rows.length) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.slice(7);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

const STATUS_MAP: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

const TEMPLATE_STATUS_FIELD = "message_template_status_update";

function collectWebhookTargets(body: WebhookBody): {
  wabaIds: Set<string>;
  phoneIds: Set<string>;
} {
  const wabaIds = new Set<string>();
  const phoneIds = new Set<string>();
  for (const entry of body.entry ?? []) {
    const entryId = entry.id?.trim();
    for (const ch of entry.changes ?? []) {
      if (ch.field === TEMPLATE_STATUS_FIELD && entryId) {
        wabaIds.add(entryId);
      }
      const phone = ch.value?.metadata?.phone_number_id?.trim();
      const statuses = ch.value?.statuses ?? [];
      const msgs = ch.value?.messages ?? [];
      if (phone && (statuses.length > 0 || msgs.length > 0)) {
        phoneIds.add(phone);
      }
    }
  }
  return { wabaIds, phoneIds };
}

type IntegrationRow = typeof tenantIntegrations.$inferSelect;

async function loadIntegrationsForWebhook(
  db: ReturnType<typeof getDb>,
  wabaIds: Set<string>,
  phoneIds: Set<string>,
): Promise<IntegrationRow[]> {
  const wabaList = [...wabaIds];
  const phoneList = [...phoneIds];
  if (wabaList.length === 0 && phoneList.length === 0) return [];

  const conditions = [];
  if (wabaList.length > 0) {
    conditions.push(inArray(tenantIntegrations.businessAccountId, wabaList));
  }
  if (phoneList.length > 0) {
    conditions.push(inArray(tenantIntegrations.phoneNumberId, phoneList));
  }

  const whereExpr =
    conditions.length === 1 ? conditions[0]! : or(...conditions);

  return db.select().from(tenantIntegrations).where(whereExpr);
}

function dedupeIntegrationsByTenant(rows: IntegrationRow[]): IntegrationRow[] {
  const m = new Map<number, IntegrationRow>();
  for (const r of rows) {
    if (!m.has(r.tenantId)) m.set(r.tenantId, r);
  }
  return [...m.values()];
}

function pickAppSecretForVerify(rows: IntegrationRow[]): string | null {
  const withSecret = rows.find((r) => r.appSecret?.trim());
  return withSecret?.appSecret?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const db = getDb();
  const { wabaIds, phoneIds } = collectWebhookTargets(body);

  if (wabaIds.size === 0 && phoneIds.size === 0) {
    return NextResponse.json({ ok: true });
  }

  const integrationRows = await loadIntegrationsForWebhook(db, wabaIds, phoneIds);
  const integrations = dedupeIntegrationsByTenant(integrationRows);

  if (integrations.length === 0) {
    return new NextResponse("Unknown integration", { status: 404 });
  }

  const appSecret = pickAppSecretForVerify(integrations);
  if (appSecret) {
    const ok = verifySignature(rawBody, signature, appSecret);
    if (!ok) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  const byWaba = new Map<string, IntegrationRow>();
  const byPhone = new Map<string, IntegrationRow>();
  for (const r of integrationRows) {
    const waba = r.businessAccountId?.trim();
    if (waba) byWaba.set(waba, r);
    byPhone.set(r.phoneNumberId, r);
  }

  const tenantsToRevalidate = new Set<number>();

  for (const entry of body.entry ?? []) {
    const wabaId = entry.id?.trim();
    const entryTimeSec = entry.time;
    const webhookTime =
      typeof entryTimeSec === "number" && Number.isFinite(entryTimeSec)
        ? new Date(entryTimeSec * 1000)
        : new Date();

    for (const ch of entry.changes ?? []) {
      if (ch.field === TEMPLATE_STATUS_FIELD && wabaId) {
        const integration = byWaba.get(wabaId);
        if (!integration) continue;

        const v = ch.value;
        if (!v?.event || v.message_template_id == null) continue;

        const metaId = String(v.message_template_id);
        await upsertWabaTemplateStatusSnapshot(db, {
          tenantId: integration.tenantId,
          metaTemplateId: metaId,
          templateName: v.message_template_name?.trim() || metaId,
          language: v.message_template_language?.trim() ?? "",
          category: v.message_template_category?.trim() ?? null,
          status: String(v.event).toUpperCase(),
          reason: v.reason == null ? null : String(v.reason),
          rejectionInfo: v.rejection_info ?? null,
          disableInfo: v.disable_info ?? null,
          otherInfo: v.other_info ?? null,
          webhookTime,
        });
        tenantsToRevalidate.add(integration.tenantId);
        continue;
      }

      const phoneId = ch.value?.metadata?.phone_number_id?.trim();
      if (!phoneId || !byPhone.has(phoneId)) continue;

      const integration = byPhone.get(phoneId)!;
      const inboundMessages = ch.value?.messages ?? [];
      const statuses = ch.value?.statuses ?? [];

      function webhookTimestampSec(ts: string | undefined): Date | null {
        if (ts == null) return null;
        const n = Number(ts);
        return Number.isFinite(n) ? new Date(n * 1000) : null;
      }

      if (inboundMessages.length > 0) {
        type InMsg = (typeof inboundMessages)[number];
        const buttonMsgs = inboundMessages.filter(
          (m): m is InMsg & { type: "button"; button: { text?: string } } =>
            m.type === "button" &&
            Boolean(m.button) &&
            Boolean(m.context?.id?.trim()),
        );
        if (buttonMsgs.length > 0) {
          const parentWamids = [
            ...new Set(
              buttonMsgs.map((m) => m.context!.id!.trim()).filter(Boolean),
            ),
          ];
          const recRows =
            parentWamids.length > 0
              ? await db
                  .select({
                    id: campaignRecipients.id,
                    wamid: campaignRecipients.wamid,
                  })
                  .from(campaignRecipients)
                  .where(
                    and(
                      eq(
                        campaignRecipients.tenantId,
                        integration.tenantId,
                      ),
                      inArray(campaignRecipients.wamid, parentWamids),
                    ),
                  )
              : [];
          const wamidToRecipient = new Map(
            recRows
              .filter((r) => r.wamid)
              .map((r) => [r.wamid!, r.id] as const),
          );
          await db.insert(whatsappDeliveryEvents).values(
            buttonMsgs.map((msg) => {
              const parentWamid = msg.context!.id!.trim();
              return {
                tenantId: integration.tenantId,
                phoneNumberId: phoneId,
                wamid: parentWamid,
                recipientId: wamidToRecipient.get(parentWamid) ?? null,
                source: "user_button",
                deliveryStatus: null,
                errors: null,
                payload: msg,
                webhookTs: webhookTimestampSec(msg.timestamp),
              };
            }),
          );
        }
      }

      if (statuses.length === 0) continue;

      type StatusItem = (typeof statuses)[number];
      type RawStatus = {
        wamid: string;
        rawStatus: string;
        mapped: "sent" | "delivered" | "read" | "failed" | null;
        errors: unknown[] | undefined;
        item: StatusItem;
      };
      const rawUpdates: RawStatus[] = [];

      for (const item of statuses) {
        const wamid = item.id?.trim();
        if (!wamid) continue;
        const rawStatus = String(item.status ?? "").trim();
        if (!rawStatus) continue;
        const mapped = STATUS_MAP[rawStatus] ?? null;
        rawUpdates.push({
          wamid,
          rawStatus,
          mapped,
          errors: item.errors,
          item,
        });
      }

      if (rawUpdates.length > 0) {
        const wamids = [...new Set(rawUpdates.map((r) => r.wamid))];
        const recRows = await db
          .select({
            id: campaignRecipients.id,
            wamid: campaignRecipients.wamid,
          })
          .from(campaignRecipients)
          .where(
            and(
              eq(campaignRecipients.tenantId, integration.tenantId),
              inArray(campaignRecipients.wamid, wamids),
            ),
          );
        const wamidToRecipient = new Map(
          recRows.filter((r) => r.wamid).map((r) => [r.wamid!, r.id] as const),
        );

        await db.insert(whatsappDeliveryEvents).values(
          rawUpdates.map((r) => ({
            tenantId: integration.tenantId,
            phoneNumberId: phoneId,
            wamid: r.wamid,
            recipientId: wamidToRecipient.get(r.wamid) ?? null,
            source: "status",
            deliveryStatus: r.rawStatus,
            errors: r.errors ?? null,
            payload: r.item,
            webhookTs: webhookTimestampSec(r.item.timestamp),
          })),
        );
      }

      const mappedRows = rawUpdates.filter((r) => r.mapped);
      if (mappedRows.length === 0) continue;

      type GroupKey = string;
      const groups = new Map<
        GroupKey,
        {
          status: "sent" | "delivered" | "read" | "failed";
          lastError: string | null;
          wamids: string[];
        }
      >();

      for (const u of mappedRows) {
        const st = u.mapped!;
        const lastError =
          st === "failed" ? JSON.stringify(u.errors ?? []) : null;
        const key: GroupKey = `${st}::${lastError ?? ""}`;
        const group = groups.get(key) ?? { status: st, lastError, wamids: [] };
        group.wamids.push(u.wamid);
        groups.set(key, group);
      }

      await Promise.all(
        [...groups.values()].map(({ status, lastError, wamids }) =>
          db
            .update(campaignRecipients)
            .set({ status, lastError, updatedAt: new Date() })
            .where(
              and(
                eq(campaignRecipients.tenantId, integration.tenantId),
                inArray(campaignRecipients.wamid, wamids),
                ne(campaignRecipients.status, "cancelled"),
              ),
            ),
        ),
      );
    }
  }

  for (const tid of tenantsToRevalidate) {
    revalidateTag(wabaTemplatesCacheTag(tid));
  }

  return NextResponse.json({ ok: true });
}

type WebhookBody = {
  entry?: {
    id?: string;
    time?: number;
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: {
          id?: string;
          status?: string;
          errors?: unknown[];
          timestamp?: string;
        }[];
        messages?: {
          type?: string;
          timestamp?: string;
          context?: { id?: string };
          button?: { payload?: string; text?: string };
        }[];
        event?: string;
        message_template_id?: number | string;
        message_template_name?: string;
        message_template_language?: string;
        reason?: string | null;
        message_template_category?: string;
        rejection_info?: { reason?: string; recommendation?: string };
        disable_info?: unknown;
        other_info?: unknown;
      };
    }[];
  }[];
};
