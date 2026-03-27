import { NextRequest, NextResponse } from "next/server";
import { bulkContactsPayloadSchema } from "@/lib/contacts/bulk-schema";
import { getBulkContactsQueue } from "@/lib/queues/bulk-contacts-queue";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bulkContactsPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }

  const queue = getBulkContactsQueue();
  const job = await queue.add("contacts-bulk", {
    tenantId: ctx.tenantId,
    ...parsed.data,
  });

  return NextResponse.json(
    { jobId: String(job.id), op: parsed.data.op },
    { status: 202 },
  );
}
