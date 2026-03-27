"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { Mail, Shield, UserMinus, UserPlus, UsersRound } from "lucide-react";

type Member = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
};

type RoleOpt = "admin" | "editor" | "support";

export default function MembersHub() {
  const params = useParams<{ tenantId: string }>();
  const membersApi = `/api/t/${params.tenantId}/members`;
  const t = useTranslations("app.members");
  const inviteLocale = routing.defaultLocale;
  const [rows, setRows] = useState<Member[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleOpt>("editor");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(membersApi);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      members: Member[];
      me: string;
      canManage: boolean;
    };
    setRows(data.members);
    setMe(data.me);
    setCanManage(data.canManage);
    setLoading(false);
  }, [membersApi]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchRole(userId: string, role: string) {
    setActionError(null);
    const res = await fetch(membersApi, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setActionError(j.error ?? t("actionError"));
      await load();
      return;
    }
    await load();
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteFeedback(null);
    setInviteBusy(true);
    const res = await fetch(membersApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        role: inviteRole,
        locale: inviteLocale,
      }),
    });
    const j = (await res.json()) as { error?: string };
    setInviteBusy(false);
    if (!res.ok) {
      setInviteFeedback({ type: "err", text: j.error ?? t("inviteError") });
      return;
    }
    setInviteEmail("");
    setInviteFeedback({ type: "ok", text: t("inviteSuccess") });
    await load();
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    const res = await fetch(membersApi, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: removeTarget.userId }),
    });
    setRemoveBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setActionError(j.error ?? t("actionError"));
      return;
    }
    setRemoveTarget(null);
    await load();
  }

  function roleLabel(r: string) {
    if (r === "admin") return t("roleAdmin");
    if (r === "editor") return t("roleEditor");
    return t("roleSupport");
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-dashed border-border bg-card">
        <p className="text-sm text-fg-muted">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-8">
      {/* Hero — equipa / roster */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: `
              linear-gradient(135deg, rgb(79 70 229 / 0.07) 0%, transparent 45%),
              linear-gradient(315deg, rgb(37 211 102 / 0.06) 0%, transparent 40%),
              repeating-linear-gradient(
                -12deg,
                transparent,
                transparent 12px,
                rgb(0 0 0 / 0.02) 12px,
                rgb(0 0 0 / 0.02) 13px
              )
            `,
          }}
        />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-lg shadow-primary-600/25">
              <UsersRound className="h-7 w-7" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {t("title")}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-fg-secondary">
                {t("subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-baseline gap-2 rounded-2xl border border-border bg-neutral-50/90 px-5 py-4 sm:shrink-0">
            <span className="font-display text-4xl font-bold tabular-nums text-fg">
              {rows.length}
            </span>
            <span className="text-sm font-medium text-fg-secondary">
              {rows.length === 1 ? t("countOne") : t("countMany")}
            </span>
          </div>
        </div>
      </header>

      {actionError ? (
        <div className="ds-alert-danger" role="alert">
          {actionError}
        </div>
      ) : null}

      {canManage ? (
        <section
          className="ds-card overflow-hidden"
          aria-labelledby="invite-heading"
        >
          <div className="flex flex-col gap-1 border-b border-border bg-neutral-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-2">
              <UserPlus
                className="h-5 w-5 text-primary-600"
                strokeWidth={1.5}
                aria-hidden
              />
              <h2
                id="invite-heading"
                className="font-display text-base font-semibold text-fg"
              >
                {t("inviteTitle")}
              </h2>
            </div>
            <p className="text-xs text-fg-secondary sm:max-w-xs sm:text-right">
              {t("inviteHint")}
            </p>
          </div>
          <form
            onSubmit={(e) => void submitInvite(e)}
            className="flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:p-6"
          >
            <label className="min-w-0 flex-1 sm:min-w-[200px]">
              <span className="ds-label !mt-0">{t("inviteEmail")}</span>
              <div className="relative mt-1.5">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="ds-input !mt-0 pl-10"
                  placeholder="nome@empresa.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>
            <label className="w-full sm:w-44">
              <span className="ds-label !mt-0">{t("inviteRole")}</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as RoleOpt)}
                className="ds-select !mt-0 w-full"
              >
                <option value="editor">{t("roleEditor")}</option>
                <option value="support">{t("roleSupport")}</option>
                <option value="admin">{t("roleAdmin")}</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={inviteBusy}
              className="ds-btn-primary h-10 w-full shrink-0 sm:w-auto sm:min-w-[140px]"
            >
              {inviteBusy ? t("inviteSending") : t("inviteCta")}
            </button>
            {inviteFeedback ? (
              <p
                className={`w-full text-sm sm:basis-full ${
                  inviteFeedback.type === "ok"
                    ? "font-medium text-success"
                    : "text-danger"
                }`}
                role="status"
              >
                {inviteFeedback.text}
              </p>
            ) : null}
          </form>
        </section>
      ) : (
        <p className="rounded-xl border border-border bg-neutral-50/80 px-4 py-3 text-sm text-fg-secondary">
          {t("readOnlyHint")}
        </p>
      )}

      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="ds-table-wrap">
          <table className="ds-table min-w-0 w-full">
            <thead>
              <tr>
                <th className="w-[38%]">{t("colMember")}</th>
                <th className="w-[22%]">{t("colRole")}</th>
                <th className="w-[40%] text-right">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <div className="font-medium text-fg">{m.email}</div>
                    {m.displayName ? (
                      <div className="text-xs text-fg-muted">
                        {m.displayName}
                      </div>
                    ) : null}
                    {me === m.userId ? (
                      <span className="mt-1 inline-block rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                        {t("you")}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {canManage ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          void patchRole(m.userId, e.target.value)
                        }
                        className="ds-select !mt-0 max-w-[200px]"
                        aria-label={t("changeRoleAria", { email: m.email })}
                      >
                        <option value="admin">{t("roleAdmin")}</option>
                        <option value="editor">{t("roleEditor")}</option>
                        <option value="support">{t("roleSupport")}</option>
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                        <Shield className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {roleLabel(m.role)}
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(m)}
                        disabled={me === m.userId}
                        className="ds-btn-ghost inline-flex items-center gap-1.5 text-danger hover:bg-danger-soft hover:text-red-800 disabled:pointer-events-none disabled:opacity-40"
                        title={
                          me === m.userId ? t("cannotRemoveSelf") : undefined
                        }
                      >
                        <UserMinus className="h-4 w-4" strokeWidth={1.5} />
                        {t("remove")}
                      </button>
                    ) : (
                      <span className="text-xs text-fg-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((m) => (
          <li
            key={m.userId}
            className="ds-card space-y-4 p-4 shadow-sm"
          >
            <div>
              <p className="font-medium text-fg">{m.email}</p>
              {m.displayName ? (
                <p className="text-sm text-fg-secondary">{m.displayName}</p>
              ) : null}
              {me === m.userId ? (
                <span className="mt-2 inline-block rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                  {t("you")}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                {t("colRole")}
              </span>
              {canManage ? (
                <select
                  value={m.role}
                  onChange={(e) => void patchRole(m.userId, e.target.value)}
                  className="ds-select !mt-0 w-full"
                  aria-label={t("changeRoleAria", { email: m.email })}
                >
                  <option value="admin">{t("roleAdmin")}</option>
                  <option value="editor">{t("roleEditor")}</option>
                  <option value="support">{t("roleSupport")}</option>
                </select>
              ) : (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                  <Shield className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {roleLabel(m.role)}
                </span>
              )}
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={() => setRemoveTarget(m)}
                disabled={me === m.userId}
                className="ds-btn-outline w-full border-danger/30 text-danger hover:bg-danger-soft"
              >
                <UserMinus className="h-4 w-4" strokeWidth={1.5} />
                {t("remove")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {removeTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-fg/30 p-4 backdrop-blur-[3px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-dialog-title"
          onClick={() => {
            if (!removeBusy) setRemoveTarget(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="remove-dialog-title"
              className="font-display text-lg font-semibold text-fg"
            >
              {t("removeTitle")}
            </h3>
            <p className="mt-2 text-sm text-fg-secondary">
              {t("removeBody", { email: removeTarget.email })}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="ds-btn-outline w-full sm:w-auto"
                onClick={() => setRemoveTarget(null)}
                disabled={removeBusy}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2 sm:w-auto"
                onClick={() => void confirmRemove()}
                disabled={removeBusy}
              >
                {removeBusy ? t("removing") : t("removeConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
