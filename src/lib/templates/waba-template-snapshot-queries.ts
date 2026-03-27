import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { wabaTemplateStatusSnapshots } from "@/lib/db/schema";

export type WabaTemplateStatusSnapshotRow = typeof wabaTemplateStatusSnapshots.$inferSelect;

export async function listWabaTemplateStatusSnapshots(
  db: AppDb,
  tenantId: number,
): Promise<WabaTemplateStatusSnapshotRow[]> {
  return db
    .select()
    .from(wabaTemplateStatusSnapshots)
    .where(eq(wabaTemplateStatusSnapshots.tenantId, tenantId));
}

export type UpsertWabaTemplateSnapshotInput = {
  tenantId: number;
  metaTemplateId: string;
  templateName: string;
  language: string;
  category: string | null;
  status: string;
  reason: string | null;
  rejectionInfo: WabaTemplateStatusSnapshotRow["rejectionInfo"];
  disableInfo: WabaTemplateStatusSnapshotRow["disableInfo"];
  otherInfo: WabaTemplateStatusSnapshotRow["otherInfo"];
  webhookTime: Date;
};

export async function upsertWabaTemplateStatusSnapshot(
  db: AppDb,
  input: UpsertWabaTemplateSnapshotInput,
): Promise<void> {
  await db
    .insert(wabaTemplateStatusSnapshots)
    .values({
      tenantId: input.tenantId,
      metaTemplateId: input.metaTemplateId,
      templateName: input.templateName,
      language: input.language,
      category: input.category,
      status: input.status.toUpperCase(),
      reason: input.reason,
      rejectionInfo: input.rejectionInfo ?? null,
      disableInfo: input.disableInfo ?? null,
      otherInfo: input.otherInfo ?? null,
      webhookTime: input.webhookTime,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        wabaTemplateStatusSnapshots.tenantId,
        wabaTemplateStatusSnapshots.metaTemplateId,
      ],
      set: {
        templateName: input.templateName,
        language: input.language,
        category: input.category,
        status: input.status.toUpperCase(),
        reason: input.reason,
        rejectionInfo: input.rejectionInfo ?? null,
        disableInfo: input.disableInfo ?? null,
        otherInfo: input.otherInfo ?? null,
        webhookTime: input.webhookTime,
        updatedAt: new Date(),
      },
    });
}
