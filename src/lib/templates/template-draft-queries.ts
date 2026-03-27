import { and, desc, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { messageTemplateDrafts } from "@/lib/db/schema";

export type MessageTemplateDraftRow = typeof messageTemplateDrafts.$inferSelect;

export async function listMessageTemplateDrafts(
  db: AppDb,
  tenantId: number,
): Promise<MessageTemplateDraftRow[]> {
  return db
    .select()
    .from(messageTemplateDrafts)
    .where(eq(messageTemplateDrafts.tenantId, tenantId))
    .orderBy(desc(messageTemplateDrafts.updatedAt));
}

export async function getMessageTemplateDraftById(
  db: AppDb,
  tenantId: number,
  draftId: string,
): Promise<MessageTemplateDraftRow | null> {
  const [row] = await db
    .select()
    .from(messageTemplateDrafts)
    .where(
      and(
        eq(messageTemplateDrafts.id, draftId),
        eq(messageTemplateDrafts.tenantId, tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertMessageTemplateDraft(
  db: AppDb,
  opts: {
    tenantId: number;
    payload: Record<string, unknown>;
    createdBy?: string | null;
  },
): Promise<MessageTemplateDraftRow> {
  const [row] = await db
    .insert(messageTemplateDrafts)
    .values({
      tenantId: opts.tenantId,
      payload: opts.payload,
      createdBy: opts.createdBy ?? null,
    })
    .returning();
  if (!row) throw new Error("insert draft failed");
  return row;
}

export async function updateMessageTemplateDraft(
  db: AppDb,
  tenantId: number,
  draftId: string,
  payload: Record<string, unknown>,
): Promise<MessageTemplateDraftRow | null> {
  const existing = await getMessageTemplateDraftById(db, tenantId, draftId);
  if (!existing) return null;
  const [row] = await db
    .update(messageTemplateDrafts)
    .set({ payload, updatedAt: new Date() })
    .where(eq(messageTemplateDrafts.id, draftId))
    .returning();
  return row ?? null;
}

export async function deleteMessageTemplateDraft(
  db: AppDb,
  tenantId: number,
  draftId: string,
): Promise<boolean> {
  const existing = await getMessageTemplateDraftById(db, tenantId, draftId);
  if (!existing) return false;
  await db
    .delete(messageTemplateDrafts)
    .where(eq(messageTemplateDrafts.id, draftId));
  return true;
}
