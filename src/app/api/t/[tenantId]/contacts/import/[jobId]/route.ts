import { NextResponse } from "next/server";
import { contactsImportJobSchema } from "@/lib/contacts/import-schema";
import { getContactsImportQueue } from "@/lib/queues/contacts-import-queue";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = {
  params: Promise<{ tenantId: string; jobId: string }>;
};

export async function GET(_req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { jobId } = await route.params;
  if (!jobId) {
    return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });
  }

  const queue = getContactsImportQueue();
  const job = await queue.getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  }

  const parsed = contactsImportJobSchema.safeParse(job.data);
  if (!parsed.success || parsed.data.tenantId !== ctx.tenantId) {
    return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  }

  const state = await job.getState();
  const progress = job.progress;

  if (state === "failed") {
    return NextResponse.json({
      state,
      progress,
      failedReason: job.failedReason ?? null,
    });
  }

  if (state === "completed") {
    return NextResponse.json({
      state,
      progress,
      result: job.returnvalue ?? null,
    });
  }

  return NextResponse.json({
    state,
    progress,
  });
}
