"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ArrowLeft, Bold, Italic, Strikethrough } from "lucide-react";
import type { DraftButton, TemplateFormState } from "@/lib/meta/template-create-payload";
import type { TemplateContactVariableRow } from "@/lib/templates/contact-template-variables";
import {
  canAddDraftButton,
  componentsFromFormStateForPreview,
  extractNamedPlaceholders,
  getSampleFieldDescriptors,
  normalizeUrlWithHttps,
  serializeDraftPayload,
  validateForMetaSubmit,
} from "@/lib/meta/template-create-payload";
import {
  applySamplesToTemplatePreviewModel,
  parseTemplatePreviewModel,
} from "@/lib/meta/template-preview-model";
import { BodyVariablePicker } from "./BodyVariablePicker";
import { WhatsAppTemplatePhonePreview } from "./WhatsAppTemplatePhonePreview";

const LANGUAGES = [
  { value: "pt_BR", label: "Português (Brasil)" },
  { value: "en_US", label: "English (US)" },
  { value: "es", label: "Español" },
  { value: "es_AR", label: "Español (Argentina)" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
] as const;

function newButtonId(): string {
  return `b-${crypto.randomUUID()}`;
}

type Props = {
  tenantId: string;
  draftId: string | null;
  initialState: TemplateFormState;
  integrationConfigured: boolean;
  contactTemplateVariables: TemplateContactVariableRow[];
};

export function TemplateCreatePageClient({
  tenantId,
  draftId: initialDraftId,
  initialState,
  integrationConfigured,
  contactTemplateVariables,
}: Props) {
  const t = useTranslations("app.templates.create");
  const router = useRouter();
  const [state, setState] = useState<TemplateFormState>(initialState);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingMeta, setSendingMeta] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmMetaOpen, setConfirmMetaOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const validation = useMemo(() => validateForMetaSubmit(state), [state]);
  const metaReady = validation.ok;
  const previewModel = useMemo(() => {
    const comps = componentsFromFormStateForPreview(state);
    const base = parseTemplatePreviewModel(comps);
    return applySamplesToTemplatePreviewModel(base, state);
  }, [state]);

  const sampleFields = useMemo(() => getSampleFieldDescriptors(state), [state]);

  function showBanner(msg: string) {
    setBanner(msg);
    window.setTimeout(() => setBanner(null), 7000);
  }

  function wrapBodySelection(before: string, after: string) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const slice = state.body.slice(start, end);
    const next =
      state.body.slice(0, start) + before + slice + after + state.body.slice(end);
    setState((s) => ({ ...s, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + before.length + slice.length + after.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function insertBodySnippet(snippet: string) {
    const el = bodyRef.current;
    if (!el) {
      setState((s) => ({ ...s, body: s.body + snippet }));
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = state.body.slice(0, start) + snippet + state.body.slice(end);
    setState((s) => ({ ...s, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function saveDraft() {
    setSavingDraft(true);
    setBanner(null);
    const payload = serializeDraftPayload(state);
    const urlBase = `/api/t/${tenantId}/templates/drafts`;
    const res = await fetch(
      draftId ? `${urlBase}/${encodeURIComponent(draftId)}` : urlBase,
      {
        method: draftId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      },
    );
    const data = (await res.json()) as {
      error?: string;
      item?: { id: string; updatedAt: string };
    };
    setSavingDraft(false);
    if (!res.ok) {
      showBanner(data.error ?? t("saveDraftError"));
      return;
    }
    if (data.item?.id) {
      setDraftId(data.item.id);
      router.replace(
        `/${tenantId}/templates/new?draftId=${encodeURIComponent(data.item.id)}`,
      );
    }
    showBanner(t("saveDraftOk"));
    router.refresh();
  }

  async function submitToMeta() {
    if (!metaReady || !integrationConfigured) return;
    setSendingMeta(true);
    setBanner(null);
    const res = await fetch(`/api/t/${tenantId}/templates/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form: serializeDraftPayload(state),
        ...(draftId ? { draftId } : {}),
      }),
    });
    const data = (await res.json()) as { error?: string; issues?: string[] };
    setSendingMeta(false);
    setConfirmMetaOpen(false);
    if (!res.ok) {
      const msg =
        data.issues?.length && data.issues[0]
          ? data.issues[0]
          : (data.error ?? t("sendMetaError"));
      showBanner(msg);
      return;
    }
    showBanner(t("sendMetaOk"));
    router.push(`/${tenantId}/templates`);
    router.refresh();
  }

  function updateButton(id: string, patch: Partial<DraftButton>) {
    setState((s) => ({
      ...s,
      buttons: s.buttons.map((b) => (b.id === id ? ({ ...b, ...patch } as DraftButton) : b)),
    }));
  }

  function removeButton(id: string) {
    setState((s) => ({
      ...s,
      buttons: s.buttons.filter((b) => b.id !== id),
    }));
  }

  function addButtonRow(kind: "url" | "quick_reply") {
    const id = newButtonId();
    let next: DraftButton;
    if (kind === "url") {
      next = { id, kind: "url", text: "", url: "https://" };
    } else {
      next = { id, kind: "quick_reply", text: "" };
    }
    setState((s) => ({
      ...s,
      buttonsEnabled: true,
      buttons: [...s.buttons, next],
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/${tenantId}/templates`}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {t("backToList")}
        </Link>
      </div>

      <div>
        <h1 className="ds-page-title">{t("title")}</h1>
        <p className="ds-subtitle mt-1">{t("subtitle")}</p>
      </div>

      {banner ? <div className="ds-alert-warning">{banner}</div> : null}
      {!integrationConfigured ? (
        <div className="ds-alert-warning">{t("needsIntegration")}</div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="ds-section-title text-base">{t("sectionBasics")}</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="tpl-name" className="ds-label">
                  {t("fieldName")}
                </label>
                <input
                  id="tpl-name"
                  className="ds-input mt-1.5"
                  value={state.name}
                  onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                  placeholder={t("fieldNamePlaceholder")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="tpl-lang" className="ds-label">
                    {t("fieldLanguage")}
                  </label>
                  <select
                    id="tpl-lang"
                    className="ds-select mt-1.5 w-full"
                    value={state.language}
                    onChange={(e) =>
                      setState((s) => ({ ...s, language: e.target.value }))
                    }
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="tpl-cat" className="ds-label">
                    {t("fieldCategory")}
                  </label>
                  <select
                    id="tpl-cat"
                    className="ds-select mt-1.5 w-full"
                    value={state.category}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        category: e.target.value as TemplateFormState["category"],
                      }))
                    }
                  >
                    <option value="MARKETING">{t("categoryMarketing")}</option>
                    <option value="UTILITY">{t("categoryUtility")}</option>
                    <option value="AUTHENTICATION">{t("categoryAuth")}</option>
                  </select>
                </div>
              </div>
              <div>
                <span className="ds-label">{t("fieldMarketingType")}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">
                    {t("marketingStandard")}
                  </span>
                  <span className="rounded-full border border-border bg-neutral-100 px-3 py-1 text-xs text-fg-muted">
                    {t("marketingSoon")}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="ds-section-title text-base">{t("sectionContent")}</h2>
            <p className="mt-2 text-sm text-fg-muted">{t("paramFormatDoc")}</p>
            <div className="mt-4 space-y-4">
              <div>
                <span className="ds-label">{t("fieldHeader")}</span>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="hk"
                      checked={state.headerKind === "none"}
                      onChange={() =>
                        setState((s) => ({ ...s, headerKind: "none", headerText: "" }))
                      }
                    />
                    {t("headerNone")}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="hk"
                      checked={state.headerKind === "text"}
                      onChange={() =>
                        setState((s) => ({ ...s, headerKind: "text" }))
                      }
                    />
                    {t("headerText")}
                  </label>
                </div>
                {state.headerKind === "text" ? (
                  <div className="mt-2">
                    <input
                      className="ds-input"
                      maxLength={60}
                      value={state.headerText}
                      onChange={(e) =>
                        setState((s) => ({ ...s, headerText: e.target.value }))
                      }
                      placeholder={t("headerTextPlaceholder")}
                    />
                    <p className="mt-1 text-xs text-fg-muted">
                      {state.headerText.length}/60
                    </p>
                  </div>
                ) : null}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="tpl-body" className="ds-label mb-0">
                    {t("fieldBody")}
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded-lg border border-border p-1.5 text-fg-muted hover:bg-neutral-100"
                      title={t("fmtBold")}
                      onClick={() => wrapBodySelection("*", "*")}
                    >
                      <Bold className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-border p-1.5 text-fg-muted hover:bg-neutral-100"
                      title={t("fmtItalic")}
                      onClick={() => wrapBodySelection("_", "_")}
                    >
                      <Italic className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-border p-1.5 text-fg-muted hover:bg-neutral-100"
                      title={t("fmtStrike")}
                      onClick={() => wrapBodySelection("~", "~")}
                    >
                      <Strikethrough className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    <BodyVariablePicker
                      body={state.body}
                      headerKind={state.headerKind}
                      headerText={state.headerText}
                      contactVariables={contactTemplateVariables}
                      onInsert={(snippet) => insertBodySnippet(snippet)}
                    />
                  </div>
                </div>
                <textarea
                  ref={bodyRef}
                  id="tpl-body"
                  className="ds-input mt-1.5 min-h-[180px] resize-y py-2 font-mono text-sm"
                  value={state.body}
                  onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
                  maxLength={1024}
                />
                <p className="mt-1 text-xs text-fg-muted">{state.body.length}/1024</p>
              </div>

              <div>
                <label htmlFor="tpl-footer" className="ds-label">
                  {t("fieldFooter")}
                </label>
                <input
                  id="tpl-footer"
                  className="ds-input mt-1.5"
                  maxLength={60}
                  value={state.footer}
                  onChange={(e) => setState((s) => ({ ...s, footer: e.target.value }))}
                />
                <p className="mt-1 text-xs text-fg-muted">{state.footer.length}/60</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="ds-section-title text-base">{t("sectionButtons")}</h2>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={state.buttonsEnabled}
                  onChange={(e) =>
                    setState((s) => ({ ...s, buttonsEnabled: e.target.checked }))
                  }
                />
                {t("buttonsEnable")}
              </label>
            </div>
            {state.buttonsEnabled ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ds-btn-outline ds-btn-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canAddDraftButton(state.buttons, "url")}
                    title={
                      !canAddDraftButton(state.buttons, "url")
                        ? t("buttonsLimitHint")
                        : undefined
                    }
                    onClick={() => addButtonRow("url")}
                  >
                    {t("addUrlButton")}
                  </button>
                  <button
                    type="button"
                    className="ds-btn-outline ds-btn-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canAddDraftButton(state.buttons, "quick_reply")}
                    title={
                      !canAddDraftButton(state.buttons, "quick_reply")
                        ? t("buttonsLimitHint")
                        : undefined
                    }
                    onClick={() => addButtonRow("quick_reply")}
                  >
                    {t("addQrButton")}
                  </button>
                </div>
                <p className="text-xs text-fg-muted">{t("buttonsLimitsDoc")}</p>
                <ul className="space-y-4">
                  {state.buttons.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-xl border border-border bg-neutral-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="text-xs font-semibold uppercase text-fg-muted">
                          {b.kind === "url" ? t("btnTypeUrl") : t("btnTypeQr")}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-danger hover:underline"
                          onClick={() => removeButton(b.id)}
                        >
                          {t("removeButton")}
                        </button>
                      </div>
                      <input
                        className="ds-input mt-2"
                        placeholder={t("btnLabelPlaceholder")}
                        maxLength={25}
                        value={b.text}
                        onChange={(e) => updateButton(b.id, { text: e.target.value })}
                      />
                      {b.kind === "url" ? (
                        <div className="mt-3 space-y-2">
                          <label className="ds-label text-xs" htmlFor={`url-${b.id}`}>
                            {t("urlFieldLabel")}
                          </label>
                          <input
                            id={`url-${b.id}`}
                            className="ds-input font-mono text-sm"
                            placeholder={t("urlFieldPlaceholder")}
                            value={b.url}
                            onChange={(e) =>
                              updateButton(b.id, { url: e.target.value } as DraftButton)
                            }
                            onBlur={() => {
                              const u = normalizeUrlWithHttps(b.url);
                              if (u !== b.url) {
                                updateButton(b.id, { url: u } as DraftButton);
                              }
                            }}
                          />
                          {extractNamedPlaceholders(b.url).length > 0 ? (
                            <p className="text-[11px] text-fg-muted">
                              {t("urlVarsShareSamples")}
                            </p>
                          ) : null}
                          <p className="text-[11px] text-fg-muted">{t("urlHttpsHint")}</p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="ds-section-title text-base">{t("sectionSamples")}</h2>
            <p className="mt-1 text-sm text-fg-secondary">{t("samplesPrivacy")}</p>
            <div className="mt-4 space-y-3">
              {sampleFields.length === 0 ? (
                <p className="text-sm text-fg-muted">{t("samplesEmpty")}</p>
              ) : (
                sampleFields.map((f) => (
                  <div key={f.sampleKey}>
                    <label className="ds-label text-xs" htmlFor={`s-${f.sampleKey}`}>
                      {f.hint}
                    </label>
                    <input
                      id={`s-${f.sampleKey}`}
                      className="ds-input mt-1"
                      value={state.samples[f.sampleKey] ?? ""}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          samples: {
                            ...s.samples,
                            [f.sampleKey]: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                ))
              )}
            </div>
          </section>

          {!metaReady && validation.ok === false ? (
            <div className="rounded-xl border border-amber-200 bg-warning-soft/40 p-4 text-sm text-amber-950">
              <p className="font-medium">{t("validationTitle")}</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {validation.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="ds-btn-outline"
              disabled={savingDraft}
              onClick={() => void saveDraft()}
            >
              {savingDraft ? t("savingDraft") : t("saveDraft")}
            </button>
            <button
              type="button"
              className="ds-btn-primary"
              disabled={
                !metaReady || !integrationConfigured || sendingMeta
              }
              onClick={() => setConfirmMetaOpen(true)}
            >
              {t("sendToMeta")}
            </button>
          </div>
        </div>

        {/* Sticky: permanece visível ao rolar o formulário (scroll em main + overflow-x-clip no AppShell). */}
        <div className="w-full lg:sticky lg:top-8 lg:z-20 lg:self-start">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-fg-muted">
            {t("previewLabel")}
          </p>
          <WhatsAppTemplatePhonePreview model={previewModel} />
        </div>
      </div>

      {confirmMetaOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-fg/30 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-meta-title"
          onClick={() => !sendingMeta && setConfirmMetaOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-meta-title" className="font-display text-lg font-semibold text-fg">
              {t("confirmMetaTitle")}
            </h2>
            <p className="mt-2 text-sm text-fg-secondary">{t("confirmMetaBody")}</p>
            <ul className="mt-3 space-y-1 rounded-lg bg-neutral-50 p-3 text-sm">
              <li>
                <span className="text-fg-muted">{t("fieldName")}: </span>
                <span className="font-medium">{state.name.trim() || "—"}</span>
              </li>
              <li>
                <span className="text-fg-muted">{t("fieldLanguage")}: </span>
                <span className="font-medium">{state.language}</span>
              </li>
              <li>
                <span className="text-fg-muted">{t("fieldCategory")}: </span>
                <span className="font-medium">{state.category}</span>
              </li>
            </ul>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="ds-btn-outline"
                disabled={sendingMeta}
                onClick={() => setConfirmMetaOpen(false)}
              >
                {t("confirmCancel")}
              </button>
              <button
                type="button"
                className="ds-btn-primary"
                disabled={sendingMeta}
                onClick={() => void submitToMeta()}
              >
                {sendingMeta ? t("sendingMeta") : t("confirmSend")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
