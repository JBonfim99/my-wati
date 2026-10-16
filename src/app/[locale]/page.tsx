import { redirect } from "next/navigation";
import {
  getSessionUser,
  listMembershipsForUser,
} from "@/lib/session";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [, user] = await Promise.all([params, getSessionUser()]);
  if (!user) {
    redirect("/login");
  }
  const memberships = await listMembershipsForUser(user.id);
  if (memberships.length === 0) {
    redirect("/select-tenant");
  }
  if (memberships.length === 1) {
    redirect(`/${memberships[0].tenantId}/dashboard`);
  }
  redirect("/select-tenant");
}
