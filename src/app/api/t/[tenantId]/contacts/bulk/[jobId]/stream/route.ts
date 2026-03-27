import {
  CONTACTS_BULK_JOB_SSE_MAX_MS,
  contactsQueueJobSseResponse,
  createContactsQueueJobSseStream,
} from "@/lib/queues/contacts-job-sse";
import { getBulkContactsJobStatusForTenant } from "@/lib/queues/contacts-job-status";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = {
  params: Promise<{ tenantId: string; jobId: string }>;
};

export async function GET(req: Request, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { jobId } = await route.params;
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId obrigatório" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const initial = await getBulkContactsJobStatusForTenant(jobId, ctx.tenantId);
  if (!initial.ok) {
    return new Response(JSON.stringify({ error: "Job não encontrado" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = createContactsQueueJobSseStream({
    signal: req.signal,
    maxMs: CONTACTS_BULK_JOB_SSE_MAX_MS,
    poll: async () => {
      const r = await getBulkContactsJobStatusForTenant(jobId, ctx.tenantId);
      if (!r.ok) return null;
      return r.body;
    },
  });

  return contactsQueueJobSseResponse(stream);
}
