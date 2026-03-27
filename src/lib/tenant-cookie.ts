export const LAST_TENANT_COOKIE = "last_tenant_id";

export const lastTenantCookieOptions = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
};
