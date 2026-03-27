import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { decodeCursor, encodeCursor, serializeContact } from "@/lib/contacts/dto";
import { listContactsInList } from "@/lib/contacts/queries";
import { CONTACTS_PAGE_SIZE } from "@/lib/contacts/contact-list-request";
import { getDb } from "@/lib/db";
import { contactLists } from "@/lib/db/schema";
import { requireTenantContext } from "@/lib/api-tenant-context";
import { parsePublicEightDigitParam } from "@/lib/ids/eight-digit";

type RouteCtx = { params: Promise<{ tenantId: string; id: string }> };

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest, route: RouteCtx) {
  const { tenantId: tp, id: idParam } = await route.params;
  const listId = parsePublicEightDigitParam(idParam);
  if (listId === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const gate = await requireTenantContext(tp);
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  const qParsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!qParsed.success) {
    return NextResponse.json(
      { error: qParsed.error.issues[0]?.message ?? "Query inválida" },
      { status: 400 },
    );
  }

  const limit = qParsed.data.limit ?? CONTACTS_PAGE_SIZE;
  const cursorRaw = qParsed.data.cursor;
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : undefined;
  if (cursorRaw && cursor === null) {
    return NextResponse.json({ error: "Cursor inválido" }, { status: 400 });
  }

  const db = getDb();
  const [listRow] = await db
    .select({ id: contactLists.id })
    .from(contactLists)
    .where(
      and(eq(contactLists.tenantId, ctx.tenantId), eq(contactLists.id, listId)),
    )
    .limit(1);
  if (!listRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { contacts, nextCursor } = await listContactsInList(db, ctx.tenantId, listId, {
    limit,
    cursor: cursor ?? undefined,
  });

  const nextCursorEncoded =
    nextCursor === null
      ? null
      : encodeCursor(nextCursor.updatedAt, nextCursor.id);

  return NextResponse.json({
    contacts: contacts.map(serializeContact),
    nextCursor: nextCursorEncoded,
  });
}
