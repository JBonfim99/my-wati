import type { MembershipRole, SessionContext } from "@/lib/session";

export function requireCtx(ctx: SessionContext | null): SessionContext {
  if (!ctx) {
    throw new Error("UNAUTHORIZED");
  }
  return ctx;
}

export function assertAdmin(ctx: SessionContext) {
  if (ctx.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
}

export function assertEditorOrAdmin(ctx: SessionContext) {
  if (ctx.role !== "admin" && ctx.role !== "editor") {
    throw new Error("FORBIDDEN");
  }
}

export function canWriteContacts(ctx: SessionContext) {
  return ctx.role === "admin" || ctx.role === "editor";
}

export function canWriteCampaigns(ctx: SessionContext) {
  return ctx.role === "admin" || ctx.role === "editor";
}

export function canManageMembers(ctx: SessionContext) {
  return ctx.role === "admin";
}

export function canManageIntegration(ctx: SessionContext) {
  return ctx.role === "admin";
}

export function isReadOnlySupport(ctx: SessionContext) {
  return ctx.role === "support";
}

export type { MembershipRole };
