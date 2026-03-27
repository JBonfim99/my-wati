import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ensureProfile } from "@/lib/profile";
import {
  getCachedTenantSession,
  getSessionUser,
  parseTenantIdFromParam,
} from "@/lib/session";
import { getTenantNavOptions } from "@/lib/tenant-nav";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; tenantId: string }>;
}) {
  const { tenantId: tenantParam } = await params;
  const tenantId = parseTenantIdFromParam(tenantParam);
  if (tenantId === null) {
    notFound();
  }

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  await ensureProfile(user);

  const ctx = await getCachedTenantSession(tenantId);
  if (!ctx) {
    redirect("/select-tenant");
  }

  const isAdmin = ctx.role === "admin";
  const tenantNav = await getTenantNavOptions(ctx.userId, ctx.tenantId);

  return (
    <AppShell
      isAdmin={isAdmin}
      tenantNav={tenantNav}
      currentTenantId={String(ctx.tenantId)}
    >
      {children}
    </AppShell>
  );
}
