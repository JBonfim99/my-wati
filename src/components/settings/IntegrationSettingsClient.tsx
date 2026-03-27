"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

export type IntegrationDto = {
  phoneNumberId: string;
  businessAccountId: string | null;
  graphApiVersion: string;
  hasAccessToken: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  updatedAt: string;
} | null;

type TestOk = {
  ok: true;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
};

type TestFail = { ok: false; error: string; errorCode?: number };

function WaMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function Spec({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-neutral-50/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-sm text-fg ${mono ? "font-mono text-[13px] leading-snug" : "font-medium"}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function IntegrationSettingsClient({
  tenantId,
}: {
  tenantId: string;
}) {
  const t = useTranslations("app.settings");
  const integrationBase = useMemo(
    () => `/api/t/${tenantId}/settings/integration`,
    [tenantId],
  );
  const [forbidden, setForbidden] = useState(false);
  const [integration, setIntegration] = useState<IntegrationDto>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestOk | TestFail | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadIntegration = useCallback(async () => {
    const res = await fetch(integrationBase);
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { integration: IntegrationDto };
    setIntegration(data.integration);
    if (data.integration) {
      setPhoneNumberId(data.integration.phoneNumberId);
      setBusinessAccountId(data.integration.businessAccountId ?? "");
      setEditing(false);
    } else {
      setPhoneNumberId("");
      setBusinessAccountId("");
      setEditing(false);
    }
    setLoading(false);
  }, [integrationBase]);

  useEffect(() => {
    void loadIntegration();
  }, [loadIntegration]);

  async function runTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const res = await fetch(`${integrationBase}/test`, {
        method: "POST",
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (data.ok === true) {
        setTestResult({
          ok: true,
          phoneNumberId: String(data.phoneNumberId ?? ""),
          displayPhoneNumber:
            data.displayPhoneNumber === null ||
            data.displayPhoneNumber === undefined
              ? null
              : String(data.displayPhoneNumber),
          verifiedName:
            data.verifiedName === null || data.verifiedName === undefined
              ? null
              : String(data.verifiedName),
        });
      } else {
        setTestResult({
          ok: false,
          error:
            typeof data.error === "string"
              ? data.error
              : t("testUnknownError"),
          errorCode:
            typeof data.errorCode === "number" ? data.errorCode : undefined,
        });
      }
    } catch {
      setTestResult({ ok: false, error: t("testNetworkError") });
    } finally {
      setTesting(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const payload: Record<string, unknown> = {
      phoneNumberId: phoneNumberId.trim(),
      businessAccountId: businessAccountId.trim() || null,
    };
    if (accessToken.trim()) payload.accessToken = accessToken.trim();
    if (verifyToken.trim()) payload.webhookVerifyToken = verifyToken.trim();
    if (appSecret.trim()) payload.appSecret = appSecret.trim();

    const res = await fetch(integrationBase, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 403) {
      setForbidden(true);
      setSaving(false);
      return;
    }
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setFormError(j.error ?? t("formError"));
      setSaving(false);
      return;
    }
    setAccessToken("");
    setVerifyToken("");
    setAppSecret("");
    await loadIntegration();
    setSaving(false);
  }

  function cancelEdit() {
    setFormError(null);
    setTestResult(null);
    if (integration) {
      setPhoneNumberId(integration.phoneNumberId);
      setBusinessAccountId(integration.businessAccountId ?? "");
      setAccessToken("");
      setVerifyToken("");
      setAppSecret("");
      setEditing(false);
    }
  }

  if (forbidden) {
    return (
      <div className="ds-card-pad ds-animate-in">
        <p className="text-sm text-fg-secondary">{t("forbidden")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border bg-card">
        <p className="text-sm text-fg-muted">{t("loading")}</p>
      </div>
    );
  }

  const configured = Boolean(integration?.hasAccessToken);
  const updatedLabel =
    integration?.updatedAt != null
      ? new Date(integration.updatedAt).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      {/* Cabeçalho */}
      <header className="ds-animate-in relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.65]"
          style={{
            background:
              "radial-gradient(ellipse 80% 120% at 0% 0%, rgb(37 211 102 / 0.18), transparent 55%), radial-gradient(ellipse 60% 80% at 100% 100%, rgb(79 70 229 / 0.08), transparent 50%)",
          }}
        />
        <div className="relative flex flex-col gap-4 border-l-[5px] border-whatsapp p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-whatsapp text-white shadow-lg shadow-whatsapp/25">
              <WaMark className="h-8 w-8" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {t("hubTitle")}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-fg-secondary">
                {t("hubSubtitle")}
              </p>
            </div>
          </div>
          {configured && !editing ? (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-900 ring-1 ring-success/20">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              {t("badgeActive")}
            </span>
          ) : null}
        </div>
      </header>

      {/* Visão geral — integração configurada */}
      {configured && !editing ? (
        <section
          className="ds-animate-in space-y-6"
          style={{ animationDelay: "60ms" }}
        >
          <div className="ds-card overflow-hidden">
            <div className="border-b border-border bg-neutral-50/80 px-6 py-4">
              <h2 className="font-display text-lg font-semibold text-fg">
                {t("sectionConnection")}
              </h2>
              <p className="mt-0.5 text-sm text-fg-secondary">
                {t("sectionConnectionHint")}
              </p>
            </div>
            <div className="grid gap-3 p-6 sm:grid-cols-2">
              <Spec
                label={t("statusPhone")}
                value={integration!.phoneNumberId}
                mono
              />
              <Spec label="Graph API" value={integration!.graphApiVersion} mono />
              <Spec
                label={t("specWaba")}
                value={
                  integration!.businessAccountId ?? (
                    <span className="text-fg-muted">{t("statusWabaUnset")}</span>
                  )
                }
                mono={Boolean(integration!.businessAccountId)}
              />
              <Spec
                label={t("specLastUpdated")}
                value={updatedLabel ?? "—"}
              />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border bg-neutral-50/40 px-6 py-4">
              <span className="rounded-md bg-card px-2.5 py-1 text-xs font-medium text-fg-secondary ring-1 ring-border">
                {t("chipWebhook")}:{" "}
                {integration!.hasVerifyToken ? t("chipOk") : t("chipMissing")}
              </span>
              <span className="rounded-md bg-card px-2.5 py-1 text-xs font-medium text-fg-secondary ring-1 ring-border">
                App Secret:{" "}
                {integration!.hasAppSecret ? t("chipOk") : t("chipOptional")}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              className="ds-btn-primary order-2 sm:order-1"
              disabled={testing}
              onClick={() => void runTest()}
            >
              {testing ? t("testRunning") : t("testConnection")}
            </button>
            <button
              type="button"
              className="ds-btn-outline order-1 sm:order-2"
              onClick={() => {
                setTestResult(null);
                setEditing(true);
              }}
            >
              {t("editCredentials")}
            </button>
            <a
              className="ds-btn-ghost order-3 text-primary-600 hover:text-primary-700"
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("docsMeta")} ↗
            </a>
          </div>

          {testResult ? (
            testResult.ok ? (
              <div
                className="rounded-xl border border-success/30 bg-success-soft/80 px-4 py-3 text-sm text-green-900"
                role="status"
              >
                <p className="font-semibold">{t("testSuccessTitle")}</p>
                <ul className="mt-2 space-y-1 text-green-900/90">
                  {testResult.displayPhoneNumber ? (
                    <li>
                      <span className="text-green-800/80">{t("testDisplayPhone")}: </span>
                      <span className="font-mono font-medium">
                        {testResult.displayPhoneNumber}
                      </span>
                    </li>
                  ) : null}
                  {testResult.verifiedName ? (
                    <li>
                      <span className="text-green-800/80">{t("testVerifiedName")}: </span>
                      {testResult.verifiedName}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : (
              <div className="ds-alert-danger" role="alert">
                <p className="font-semibold">{t("testFailTitle")}</p>
                <p className="mt-1">{testResult.error}</p>
                {testResult.errorCode != null ? (
                  <p className="mt-1 font-mono text-xs opacity-80">
                    code {testResult.errorCode}
                  </p>
                ) : null}
              </div>
            )
          ) : null}
        </section>
      ) : null}

      {/* Estado vazio (sem integração completa) */}
      {!configured && !editing ? (
        <section
          className="ds-animate-in rounded-2xl border-2 border-dashed border-border-strong bg-neutral-50/50 px-8 py-14 text-center"
          style={{ animationDelay: "60ms" }}
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-whatsapp-soft text-whatsapp-dark">
            <WaMark className="h-9 w-9" />
          </div>
          <h2 className="font-display text-xl font-semibold text-fg">
            {t("emptyTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-secondary">
            {t("emptyBody")}
          </p>
          <button
            type="button"
            className="ds-btn-primary mt-8"
            onClick={() => setEditing(true)}
          >
            {t("ctaConfigure")}
          </button>
        </section>
      ) : null}

      {/* Formulário (primeira config ou edição) */}
      {editing ? (
        <section
          className="ds-animate-in ds-card"
          style={{ animationDelay: configured ? "40ms" : "0ms" }}
        >
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-fg">
              {configured ? t("formTitleEdit") : t("formTitleSetup")}
            </h2>
            <p className="mt-1 text-sm text-fg-secondary">{t("formIntro")}</p>
          </div>
          <form
            onSubmit={(e) => void save(e)}
            className="space-y-5 p-6"
          >
            <p className="rounded-xl bg-primary-50/80 px-4 py-3 text-sm text-fg-secondary ring-1 ring-primary-100">
              {t("storageHintShort")}
            </p>
            <label className="ds-label">
              {t("phoneNumberId")}
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="ds-input"
                required
              />
            </label>
            <label className="ds-label">
              {t("accessToken")}
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="ds-input"
                placeholder={
                  integration?.hasAccessToken
                    ? t("placeholderKeepSecret")
                    : t("placeholderPasteToken")
                }
                autoComplete="off"
              />
            </label>
            <label className="ds-label">
              {t("verifyToken")}
              <input
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="ds-input"
                placeholder={
                  integration?.hasVerifyToken
                    ? t("placeholderKeepVerify")
                    : undefined
                }
                autoComplete="off"
              />
            </label>
            <label className="ds-label">
              {t("appSecret")}
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className="ds-input"
                placeholder={
                  integration?.hasAppSecret
                    ? t("placeholderKeepSecret")
                    : undefined
                }
                autoComplete="off"
              />
            </label>
            <label className="ds-label">
              {t("businessAccountId")}
              <input
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                className="ds-input"
              />
            </label>
            {formError ? (
              <p className="text-sm text-danger">{formError}</p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-6 sm:flex-row sm:justify-end">
              {configured ? (
                <button
                  type="button"
                  className="ds-btn-outline w-full sm:w-auto"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  {t("cancel")}
                </button>
              ) : (
                <button
                  type="button"
                  className="ds-btn-ghost w-full text-fg-secondary sm:w-auto"
                  onClick={() => {
                    setFormError(null);
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  {t("back")}
                </button>
              )}
              <button
                type="submit"
                className="ds-btn-primary w-full sm:min-w-[140px] sm:w-auto"
                disabled={saving}
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
