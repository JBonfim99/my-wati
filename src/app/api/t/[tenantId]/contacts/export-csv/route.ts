import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { CONTACT_BULK_MAX_IDS } from "@/lib/contacts/contact-list-request";
import { getContactWithDetails, listContactFieldDefs } from "@/lib/contacts/queries";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { canWriteContacts } from "@/lib/rbac";

type RouteCtx = { params: Promise<{ tenantId: string }> };

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(CONTACT_BULK_MAX_IDS),
});

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatCustomValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return String(v);
  }
  return JSON.stringify(v);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest, route: RouteCtx) {
  const gate = await requireTenantContext((await route.params).tenantId);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;
  if (!canWriteContacts(ctx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const ids = [...new Set(parsed.data.ids)];
  const db = getDb();

  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, ctx.tenantId), inArray(contacts.id, ids)));
  if (owned.length !== ids.length) {
    return NextResponse.json(
      { error: "Um ou mais contatos não existem nesta organização." },
      { status: 400 },
    );
  }

  const fieldDefs = await listContactFieldDefs(db, ctx.tenantId);
  const sortedDefs = [...fieldDefs].sort((a, b) => a.sortOrder - b.sortOrder);

  const headerBase = ["telefone", "nome", "email", "tags"];
  const headerCustom = sortedDefs.map((d) => d.label.replace(/\r?\n/g, " "));
  const headerLine = [...headerBase, ...headerCustom].map(escapeCsvCell).join(",");

  const rows: string[] = [headerLine];

  for (const part of chunk(ids, 80)) {
    const details = await Promise.all(
      part.map((id) => getContactWithDetails(db, ctx.tenantId, id)),
    );
    for (const c of details) {
      if (!c) continue;
      const tagNames = c.tags.map((t) => t.name).join("; ");
      const baseCells = [
        c.phoneE164,
        c.name ?? "",
        c.email ?? "",
        tagNames,
      ];
      const customCells = sortedDefs.map((d) =>
        formatCustomValue(c.customValues[d.id]),
      );
      const line = [...baseCells, ...customCells]
        .map((cell) => escapeCsvCell(cell))
        .join(",");
      rows.push(line);
    }
  }

  const csv = `\uFEFF${rows.join("\r\n")}`;
  const filename = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
