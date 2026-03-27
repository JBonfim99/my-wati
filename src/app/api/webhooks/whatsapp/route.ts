import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  campaignRecipients,
  tenantIntegrations,
} from "@/lib/db/schema";

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

function verifySignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.slice(7);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
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
  const phoneId =
    body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  if (!phoneId) {
    return NextResponse.json({ ok: true });
  }

  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.phoneNumberId, phoneId))
    .limit(1);

  if (!integration) {
    return new NextResponse("Unknown integration", { status: 404 });
  }

  if (integration.appSecret) {
    const ok = verifySignature(rawBody, signature, integration.appSecret);
    if (!ok) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  const statuses =
    body.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];
  for (const item of statuses) {
    const wamid = item.id;
    const status = item.status;
    if (!wamid) continue;

    const map: Record<string, "sent" | "delivered" | "read" | "failed"> = {
      sent: "sent",
      delivered: "delivered",
      read: "read",
      failed: "failed",
    };
    const key = status ?? "";
    const next = map[key];
    if (!next) continue;

    await db
      .update(campaignRecipients)
      .set({
        status: next,
        lastError:
          item.status === "failed"
            ? JSON.stringify(item.errors ?? [])
            : null,
        updatedAt: new Date(),
      })
      .where(eq(campaignRecipients.wamid, wamid));
  }

  return NextResponse.json({ ok: true });
}

type WebhookBody = {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: {
          id?: string;
          status?: string;
          errors?: unknown[];
        }[];
      };
    }[];
  }[];
};
