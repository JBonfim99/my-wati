import { NextResponse } from "next/server";
import {
  getSessionContextForTenant,
  getSessionUser,
  parseTenantIdFromParam,
  type SessionContext,
} from "@/lib/session";

export type TenantRouteFail =
  | { ok: false; response: NextResponse }
  | { ok: true; ctx: SessionContext };

export async function requireTenantContext(
  tenantParam: string,
): Promise<TenantRouteFail> {
  const tenantId = parseTenantIdFromParam(tenantParam);
  if (tenantId === null) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid tenant" }, { status: 400 }),
    };
  }
  const ctx = await getSessionContextForTenant(tenantId);
  if (!ctx) {
    const user = await getSessionUser();
    return {
      ok: false,
      response: NextResponse.json(
        { error: user ? "Forbidden" : "Unauthorized" },
        { status: user ? 403 : 401 },
      ),
    };
  }
  return { ok: true, ctx };
}
