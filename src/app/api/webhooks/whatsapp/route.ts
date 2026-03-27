import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  campaignRecipients,
  tenantIntegrations,
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
      const statuses = ch.value?.statuses;
      if (phone && statuses && statuses.length > 0) {
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
      const statuses = ch.value?.statuses ?? [];
      if (!phoneId || statuses.length === 0) continue;

      if (!byPhone.has(phoneId)) continue;

      type StatusUpdate = {
        wamid: string;
        status: "sent" | "delivered" | "read" | "failed";
        errors?: unknown[];
      };
      const updates: StatusUpdate[] = [];

      for (const item of statuses) {
        const wamid = item.id;
        if (!wamid) continue;
        const next = STATUS_MAP[item.status ?? ""];
        if (!next) continue;
        updates.push({ wamid, status: next, errors: item.errors });
      }

      if (updates.length === 0) continue;

      type GroupKey = string;
      const groups = new Map<
        GroupKey,
        {
          status: "sent" | "delivered" | "read" | "failed";
          lastError: string | null;
          wamids: string[];
        }
      >();

      for (const u of updates) {
        const lastError =
          u.status === "failed" ? JSON.stringify(u.errors ?? []) : null;
        const key: GroupKey = `${u.status}::${lastError ?? ""}`;
        const group =
          groups.get(key) ?? { status: u.status, lastError, wamids: [] };
        group.wamids.push(u.wamid);
        groups.set(key, group);
      }

      await Promise.all(
        [...groups.values()].map(({ status, lastError, wamids }) =>
          db
            .update(campaignRecipients)
            .set({ status, lastError, updatedAt: new Date() })
            .where(inArray(campaignRecipients.wamid, wamids)),
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
