import { NextResponse } from "next/server";
import { getContactsImportJobStatusForTenant } from "@/lib/queues/contacts-job-status";
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

  const r = await getContactsImportJobStatusForTenant(jobId, ctx.tenantId);
  if (!r.ok) {
    return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  }

  return NextResponse.json(r.body);
}
