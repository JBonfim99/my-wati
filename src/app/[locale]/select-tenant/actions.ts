"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { tenantMemberships } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { parseTenantIdFromParam } from "@/lib/session";
import {
  LAST_TENANT_COOKIE,
  lastTenantCookieOptions,
} from "@/lib/tenant-cookie";

export async function setActiveTenant(formData: FormData) {
  const raw = formData.get("tenantId");
  const tenantId =
    typeof raw === "string" ? parseTenantIdFromParam(raw) : null;
  if (tenantId === null) return;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }

  const db = getDb();
  const [m] = await db
    .select()
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.userId, data.user.id),
        eq(tenantMemberships.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!m) return;

  const cookieStore = await cookies();
  cookieStore.set(LAST_TENANT_COOKIE, String(tenantId), lastTenantCookieOptions);

  redirect(`/${tenantId}/dashboard`);
}
