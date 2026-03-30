import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { syncCampaignFinishedStatus } from "@/lib/campaigns/sync-campaign-status";
import { listCampaignsPaginated } from "@/lib/campaigns/list-queries";
import { zEightDigitId } from "@/lib/ids/eight-digit";
import { getDb } from "@/lib/db";
import {
  campaigns,
  campaignRecipients,
  contactListMembers,
  contactLists,
  contacts,
} from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteCampaigns } from "@/lib/rbac";
import { getCampaignQueue } from "@/lib/queues/campaign-queue";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const queryListSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z
    .enum([
      "draft",
      "queued",
      "scheduled",
      "sending",
      "completed",
      "failed",
      "cancelled",
    ])
    .optional(),
  q: z.string().max(200).optional(),
  template: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const createCampaignBodySchema = z
  .object({
    name: z.string().trim().min(1),
    templateName: z.string().trim().min(1),
    templateLanguage: z.string().trim().optional(),
    listId: zEightDigitId,
    templateComponents: z.array(z.unknown()).optional(),
    scheduledAt: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const raw = data.scheduledAt?.trim();
    if (!raw) return;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) {
      ctx.addIssue({
        code: "custom",
        message: "Data de agendamento inválida",
        path: ["scheduledAt"],
      });
      return;
    }
    if (t <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        message: "Agende uma data e hora no futuro (após o horário atual)",
        path: ["scheduledAt"],
      });
    }
  });

export async function GET(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  const db = getDb();

  const maybeStuck = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(eq(campaigns.tenantId, ctx.tenantId), eq(campaigns.status, "sending")),
    );

  await Promise.all(maybeStuck.map((row) => syncCampaignFinishedStatus(row.id)));

  const url = new URL(req.url);
  const parsed = queryListSchema.safeParse({
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    status: url.searchParams.get("status") || undefined,
    q: url.searchParams.get("q") || undefined,
    template: url.searchParams.get("template") || undefined,
    page: url.searchParams.get("page") || undefined,
    pageSize: url.searchParams.get("pageSize") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos" },
      { status: 400 },
    );
  }

  const q = parsed.data;
  if (q.from && q.to && q.from > q.to) {
    return NextResponse.json(
      { error: "A data inicial não pode ser depois da final" },
      { status: 400 },
    );
  }
  const { rows, total } = await listCampaignsPaginated(db, ctx.tenantId, {
    from: q.from,
    to: q.to,
    status: q.status,
    q: q.q,
    template: q.template,
    page: q.page,
    pageSize: q.pageSize,
  });

  return NextResponse.json({
    campaigns: rows.map((c) => ({
      id: c.id,
      name: c.name,
      templateName: c.templateName,
      templateLanguage: c.templateLanguage,
      status: c.status,
      sentAt: c.firstSentAt?.toISOString() ?? null,
      scheduledAt: c.scheduledAt?.toISOString() ?? null,
      totalRecipients: c.totalRecipients,
      sentOk: c.sentOk,
      deliveredCount: c.deliveredCount,
      readCount: c.readCount,
      failedCount: c.failedCount,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteCampaigns(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsedBody = createCampaignBodySchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Dados inválidos para criar campanha",
      },
      { status: 400 },
    );
  }
  const body = parsedBody.data;

  const db = getDb();

  const [listExists] = await db
    .select()
    .from(contactLists)
    .where(
      and(
        eq(contactLists.id, body.listId),
        eq(contactLists.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (!listExists) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const memberContacts = await db
    .select({
      id: contacts.id,
      phoneE164: contacts.phoneE164,
    })
    .from(contacts)
    .innerJoin(
      contactListMembers,
      eq(contactListMembers.contactId, contacts.id),
    )
    .where(eq(contactListMembers.listId, body.listId));

  if (!memberContacts.length) {
    return NextResponse.json({ error: "List is empty" }, { status: 400 });
  }

  const scheduledRaw = body.scheduledAt?.trim();
  const scheduledAtDate = scheduledRaw
    ? new Date(Date.parse(scheduledRaw))
    : null;
  const delayMs =
    scheduledAtDate && !Number.isNaN(scheduledAtDate.getTime())
      ? Math.max(0, scheduledAtDate.getTime() - Date.now())
      : 0;

  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId: ctx.tenantId,
      name: body.name,
      templateName: body.templateName,
      templateLanguage: body.templateLanguage ?? "pt_BR",
      templateComponents: body.templateComponents ?? null,
      listId: body.listId,
      status: delayMs > 0 ? "scheduled" : "queued",
      scheduledAt: delayMs > 0 ? scheduledAtDate : null,
      createdBy: ctx.userId,
    })
    .returning();

  if (!campaign) {
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }

  const recipientRows = memberContacts.map((c) => ({
    campaignId: campaign.id,
    tenantId: ctx.tenantId,
    contactId: c.id,
    phoneE164: c.phoneE164,
    status: "queued" as const,
  }));

  const inserted = await db
    .insert(campaignRecipients)
    .values(recipientRows)
    .returning({ id: campaignRecipients.id });

  const queue = getCampaignQueue();
  for (const r of inserted) {
    await queue.add(
      "send",
      { recipientId: r.id, tenantId: ctx.tenantId },
      { jobId: `${r.id}`, ...(delayMs > 0 ? { delay: delayMs } : {}) },
    );
  }

  if (delayMs === 0) {
    await db
      .update(campaigns)
      .set({ status: "sending" })
      .where(eq(campaigns.id, campaign.id));
  }

  return NextResponse.json({ campaign, recipients: inserted.length });
}
