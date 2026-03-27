import { redirect } from "next/navigation";

export default async function TenantRootPage({
  params,
}: {
  params: Promise<{ locale: string; tenantId: string }>;
}) {
  const { tenantId } = await params;
  redirect(`/${tenantId}/dashboard`);
}
