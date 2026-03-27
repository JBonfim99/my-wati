import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const [row] = await db
    .select({
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return NextResponse.json({
    displayName: row?.displayName ?? null,
    email: user.email || row?.email || "",
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { displayName?: string | null };
  if (!("displayName" in body)) {
    return NextResponse.json(
      { error: "Campo displayName obrigatório" },
      { status: 400 },
    );
  }
  const name =
    body.displayName === null || body.displayName === undefined
      ? null
      : body.displayName.trim() || null;

  const db = getDb();
  await db
    .update(profiles)
    .set({ displayName: name })
    .where(eq(profiles.id, user.id));

  const [row] = await db
    .select({ displayName: profiles.displayName, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return NextResponse.json({
    displayName: row?.displayName ?? null,
    email: user.email || row?.email || "",
  });
}
