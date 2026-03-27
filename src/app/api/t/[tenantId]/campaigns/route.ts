import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { syncCampaignFinishedStatus } from "@/lib/campaigns/sync-campaign-status";
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

const createCampaignBodySchema = z.object({
  name: z.string().trim().min(1),
  templateName: z.string().trim().min(1),
  templateLanguage: z.string().trim().optional(),
  listId: zEightDigitId,
  templateComponents: z.array(z.unknown()).optional(),
});

export async function GET(_req: Request, route: RouteCtx) {
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

  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.tenantId, ctx.tenantId));
  return NextResponse.json({ campaigns: rows });
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
          "name, templateName, listId required",
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

  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId: ctx.tenantId,
      name: body.name,
      templateName: body.templateName,
      templateLanguage: body.templateLanguage ?? "pt_BR",
      templateComponents: body.templateComponents ?? null,
      listId: body.listId,
      status: "queued",
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
      { jobId: `${r.id}` },
    );
  }

  await db
    .update(campaigns)
    .set({ status: "sending" })
    .where(eq(campaigns.id, campaign.id));

  return NextResponse.json({ campaign, recipients: inserted.length });
}
