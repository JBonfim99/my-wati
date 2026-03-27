import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { syncCampaignFinishedStatus } from "@/lib/campaigns/sync-campaign-status";
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

  const body = (await req.json()) as {
    name?: string;
    templateName?: string;
    templateLanguage?: string;
    listId?: string;
    templateComponents?: unknown[];
  };

  if (!body.name || !body.templateName || !body.listId) {
    return NextResponse.json(
      { error: "name, templateName, listId required" },
      { status: 400 },
    );
  }

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
