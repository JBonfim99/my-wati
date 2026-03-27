import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getSessionUser,
  listMembershipsForUser,
} from "@/lib/session";
import { parseTenantIdFromParam } from "@/lib/tenant-id-param";
import { LAST_TENANT_COOKIE } from "@/lib/tenant-cookie";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ path: "/login" });
  }

  const memberships = await listMembershipsForUser(user.id);
  if (memberships.length === 0) {
    return NextResponse.json({ path: "/select-tenant" });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(LAST_TENANT_COOKIE)?.value;
  const fromCookie = raw ? parseTenantIdFromParam(raw) : null;
  if (
    fromCookie !== null &&
    memberships.some((m) => m.tenantId === fromCookie)
  ) {
    return NextResponse.json({ path: `/${fromCookie}/dashboard` });
  }

  const sorted = [...memberships].sort((a, b) => b.tenantId - a.tenantId);
  return NextResponse.json({ path: `/${sorted[0].tenantId}/dashboard` });
}
