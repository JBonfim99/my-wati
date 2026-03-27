import { NextResponse } from "next/server";
import { getSessionUser, listMembershipsForUser } from "@/lib/session";

/** Sessão global (sem tenant ativo): útil para clientes fora do path do tenant. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const memberships = await listMembershipsForUser(user.id);
  return NextResponse.json({
    userId: user.id,
    email: user.email,
    memberships,
  });
}
