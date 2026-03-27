"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Bold,
  CheckCircle2,
  Italic,
  Link2,
  Loader2,
  Reply,
  Strikethrough,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import type { DraftButton, TemplateFormState } from "@/lib/meta/template-create-payload";
import type { TemplateContactVariableRow } from "@/lib/templates/contact-template-variables";
import {
  canAddDraftButton,
  componentsFromFormStateForPreview,
  getSampleFieldDescriptors,
  mergeTenantFixedSamplesIntoFormState,
  getTemplateFormFieldErrorKeys,
  isValidNamedTemplatePlaceholderName,
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

const HTTPS_PREFIX = "https://";

/** Trecho editável à direita de https:// */
function httpsEditableRest(full: string): string {
  const n = normalizeUrlWithHttps(full);
  if (n.length <= HTTPS_PREFIX.length) return "";
  return n.slice(HTTPS_PREFIX.length).replace(/^\/+/, "");
}

function fullUrlFromEditableRest(rest: string): string {
  let r = rest;
  const low = r.toLowerCase();
  if (low.startsWith("https://")) r = r.slice(HTTPS_PREFIX.length);
  else if (low.startsWith("http://")) r = r.slice(7);
  r = r.replace(/^\/+/, "").trim();
  return normalizeUrlWithHttps(r ? `${HTTPS_PREFIX}${r}` : HTTPS_PREFIX);
}

/** Mantém `samples[nome]` alinhado à URL de exemplo do cabeçalho IMAGE (variável nomeada). */
function syncHeaderImageSampleToNamedParam(s: TemplateFormState): TemplateFormState {
  if (
    s.headerKind !== "image" ||
    s.headerImageBinding !== "variable" ||
    s.parameterFormat !== "named"
  ) {
    return s;
  }
  const vn = s.headerImageUrlVariableName.trim();
  const url = s.headerImageSampleUrl.trim();
  if (!vn) return s;
  if ((s.samples[vn] ?? "") === url) return s;
  return { ...s, samples: { ...s.samples, [vn]: url } };
}

export type TenantFixedFieldForTemplate = {
  key: string;
  label: string;
  value: string;
};

type Props = {
  tenantId: string;
  draftId: string | null;
  initialState: TemplateFormState;
  integrationConfigured: boolean;
  contactTemplateVariables: TemplateContactVariableRow[];
  tenantFixedFields?: TenantFixedFieldForTemplate[];
  /** Permite criar campo fixo no seletor de variáveis (admin/editor). */
  canWriteTenantFixed?: boolean;
};

export function TemplateCreatePageClient({
  tenantId,
  draftId: initialDraftId,
  initialState,
  integrationConfigured,
  contactTemplateVariables: initialContactVars,
  tenantFixedFields,
  canWriteTenantFixed = true,
}: Props) {
  const [contactVars, setContactVars] = useState<TemplateContactVariableRow[]>(
    () => initialContactVars,
  );
  const [tenantFixedLocal, setTenantFixedLocal] = useState<
    TenantFixedFieldForTemplate[]
  >(() =>
    tenantFixedFields === undefined ? [] : [...tenantFixedFields],
  );
  const t = useTranslations("app.templates.create");
  const tErr = useTranslations("app.templates.create.fieldErrors");
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<TemplateFormState>(initialState);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);

  useEffect(() => {
    setState((s) => mergeTenantFixedSamplesIntoFormState(s, tenantFixedLocal));
  }, [
    tenantFixedLocal,
    state.body,
    state.headerKind,
    state.headerText,
    state.headerImageBinding,
    state.headerImageUrlVariableName,
    state.buttons,
  ]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingMeta, setSendingMeta] = useState(false);
  const [metaSendPhase, setMetaSendPhase] = useState(0);
  const [confirmMetaOpen, setConfirmMetaOpen] = useState(false);
  const [metaSubmitOutcome, setMetaSubmitOutcome] = useState<
    | null
    | { kind: "success"; templateName: string }
    | { kind: "error"; message: string }
  >(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const validation = useMemo(() => validateForMetaSubmit(state), [state]);
  const metaReady = validation.ok;
  const fieldErrorKeys = useMemo(() => getTemplateFormFieldErrorKeys(state), [state]);
  const hasFieldErrors = useMemo(
    () => Object.keys(fieldErrorKeys).length > 0,
    [fieldErrorKeys],
  );

  /** Só mostra borda/ícone/texto de erro depois que o campo recebeu foco ao menos uma vez. */
  const [focusedFields, setFocusedFields] = useState<Record<string, true>>({});
  const markFocused = (key: string) => {
    setFocusedFields((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };
  const showErr = (key: string, code: string | undefined) =>
    Boolean(code && focusedFields[key]);

  const inpErr = (hasError: boolean) =>
    hasError
      ? "border-danger/90 bg-danger-soft/25 pr-10 focus:border-danger focus:ring-2 focus:ring-danger/25"
      : "";
  const previewModel = useMemo(() => {
    const comps = componentsFromFormStateForPreview(state);
    const base = parseTemplatePreviewModel(comps);
    return applySamplesToTemplatePreviewModel(base, state);
  }, [state]);

  const tenantFixedHints = useMemo(
    () => tenantFixedLocal.map(({ key, label }) => ({ key, label })),
    [tenantFixedLocal],
  );

  const sampleFields = useMemo(
    () => getSampleFieldDescriptors(state, tenantFixedHints),
    [state, tenantFixedHints],
  );

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
      markFocused("body");
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
      markFocused("body");
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function saveDraft() {
    setSavingDraft(true);
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
      toast.error(data.error ?? t("saveDraftError"));
      return;
    }
    if (data.item?.id) {
      setDraftId(data.item.id);
    }
    toast.success(t("saveDraftOk"));
    router.push(`/${tenantId}/templates`);
    router.refresh();
  }

  const metaSendPhaseKeys = useMemo(() => {
    const hasImg =
      state.headerKind === "image" && state.headerImageSampleUrl.trim().length > 0;
    if (hasImg) {
      return [
        "sendMetaProgressBuild",
        "sendMetaProgressUpload",
        "sendMetaProgressCreating",
        "sendMetaProgressWait",
      ] as const;
    }
    return [
      "sendMetaProgressBuild",
      "sendMetaProgressCreating",
      "sendMetaProgressWait",
    ] as const;
  }, [state.headerKind, state.headerImageSampleUrl]);

  useEffect(() => {
    if (!sendingMeta) {
      setMetaSendPhase(0);
      return;
    }
    setMetaSendPhase(0);
    const hasImg =
      state.headerKind === "image" && state.headerImageSampleUrl.trim().length > 0;
    const maxPhase = hasImg ? 3 : 2;
    const id = setInterval(() => {
      setMetaSendPhase((p) => (p >= maxPhase ? p : p + 1));
    }, 2200);
    return () => clearInterval(id);
  }, [sendingMeta, state.headerKind, state.headerImageSampleUrl]);

  async function submitToMeta() {
    if (!metaReady || !integrationConfigured) return;
    setMetaSubmitOutcome(null);
    setSendingMeta(true);
    try {
      const res = await fetch(`/api/t/${tenantId}/templates/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form: serializeDraftPayload(state),
          ...(draftId ? { draftId } : {}),
        }),
      });
      let data: {
        error?: string;
        issues?: string[];
        item?: { name?: string; id?: string };
      } = {};
      try {
        data = (await res.json()) as {
          error?: string;
          issues?: string[];
          item?: { name?: string; id?: string };
        };
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const msg =
          data.issues?.length && data.issues[0]
            ? data.issues[0]
            : (data.error ?? t("sendMetaError"));
        setMetaSubmitOutcome({ kind: "error", message: msg });
        return;
      }
      const nameFromApi = data.item?.name?.trim();
      const templateName =
        nameFromApi && nameFromApi.length > 0
          ? nameFromApi
          : (state.name.trim() || "—");
      setMetaSubmitOutcome({ kind: "success", templateName });
      setDraftId(null);
      void router.refresh();
    } catch {
      setMetaSubmitOutcome({
        kind: "error",
        message: t("sendMetaError"),
      });
    } finally {
      setSendingMeta(false);
    }
  }

  function closeMetaDialog() {
    setConfirmMetaOpen(false);
    setMetaSubmitOutcome(null);
    setSendingMeta(false);
  }

  function goToTemplatesAfterSuccess() {
    closeMetaDialog();
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
                <div className="relative mt-1.5">
                  <input
                    id="tpl-name"
                    className={`ds-input mt-0 w-full ${inpErr(showErr("name", fieldErrorKeys.name))}`}
                    value={state.name}
                    onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                    onFocus={() => markFocused("name")}
                    placeholder={t("fieldNamePlaceholder")}
                    aria-invalid={showErr("name", fieldErrorKeys.name) ? true : undefined}
                    aria-describedby={
                      showErr("name", fieldErrorKeys.name) ? "tpl-name-err" : undefined
                    }
                  />
                  {showErr("name", fieldErrorKeys.name) ? (
                    <AlertCircle
                      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-danger"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : null}
                </div>
                {showErr("name", fieldErrorKeys.name) ? (
                  <p id="tpl-name-err" className="mt-1 text-xs text-danger" role="alert">
                    {tErr(fieldErrorKeys.name)}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="tpl-lang" className="ds-label">
                    {t("fieldLanguage")}
                  </label>
                  <div className="relative mt-1.5">
                    <select
                      id="tpl-lang"
                      className={`ds-select mt-0 w-full ${inpErr(showErr("language", fieldErrorKeys.language))}`}
                      value={state.language}
                      onChange={(e) =>
                        setState((s) => ({ ...s, language: e.target.value }))
                      }
                      onFocus={() => markFocused("language")}
                      aria-invalid={showErr("language", fieldErrorKeys.language) ? true : undefined}
                      aria-describedby={
                        showErr("language", fieldErrorKeys.language) ? "tpl-lang-err" : undefined
                      }
                    >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                    </select>
                    {showErr("language", fieldErrorKeys.language) ? (
                      <AlertCircle
                        className="pointer-events-none absolute right-9 top-1/2 size-4 -translate-y-1/2 text-danger"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  {showErr("language", fieldErrorKeys.language) ? (
                    <p id="tpl-lang-err" className="mt-1 text-xs text-danger" role="alert">
                      {tErr(fieldErrorKeys.language)}
                    </p>
                  ) : null}
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
                        setState((s) => ({
                          ...s,
                          headerKind: "none",
                          headerText: "",
                          headerImageSampleUrl: "",
                          headerImageUrlVariableName: "",
                        }))
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
                        setState((s) => ({
                          ...s,
                          headerKind: "text",
                          headerImageSampleUrl: "",
                          headerImageUrlVariableName: "",
                        }))
                      }
                    />
                    {t("headerText")}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="hk"
                      checked={state.headerKind === "image"}
                      onChange={() =>
                        setState((s) => ({
                          ...s,
                          headerKind: "image",
                          headerText: "",
                        }))
                      }
                    />
                    {t("headerImage")}
                  </label>
                </div>
                {state.headerKind === "image" ? (
                  <div className="mt-4 space-y-4 rounded-xl border border-border bg-neutral-50/80 p-4">
                    <div>
                      <span className="ds-label">{t("headerImageUseLabel")}</span>
                      <div className="mt-2 flex flex-wrap gap-4">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="hib"
                            checked={state.headerImageBinding === "fixed"}
                            onChange={() =>
                              setState((s) =>
                                syncHeaderImageSampleToNamedParam({
                                  ...s,
                                  headerImageBinding: "fixed",
                                }),
                              )
                            }
                          />
                          {t("headerImageFixed")}
                        </label>
                        <label
                          className={`flex cursor-pointer items-center gap-2 text-sm ${
                            state.parameterFormat === "positional"
                              ? "cursor-not-allowed opacity-50"
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="hib"
                            disabled={state.parameterFormat === "positional"}
                            checked={state.headerImageBinding === "variable"}
                            onChange={() =>
                              setState((s) =>
                                syncHeaderImageSampleToNamedParam({
                                  ...s,
                                  headerImageBinding: "variable",
                                }),
                              )
                            }
                          />
                          {t("headerImageVariable")}
                        </label>
                      </div>
                      <p className="mt-2 text-xs text-fg-muted">
                        {t("headerImageUseHint")}
                      </p>
                      {state.parameterFormat === "positional" ? (
                        <p className="mt-2 text-xs text-amber-800">
                          {t("headerImageVariableNamedOnlyHint")}
                        </p>
                      ) : null}
                    </div>
                    {state.headerImageBinding === "variable" &&
                    state.parameterFormat === "named" ? (
                      <div>
                        <label htmlFor="tpl-header-img-var" className="ds-label">
                          {t("headerImageUrlVariableName")}
                        </label>
                        <div className="relative mt-1.5">
                          <input
                            id="tpl-header-img-var"
                            className={`ds-input mt-0 w-full font-mono text-sm ${inpErr(
                              showErr(
                                "headerImageVariable",
                                fieldErrorKeys.headerImageVariable,
                              ),
                            )}`}
                            value={state.headerImageUrlVariableName}
                            onChange={(e) =>
                              setState((s) =>
                                syncHeaderImageSampleToNamedParam({
                                  ...s,
                                  headerImageUrlVariableName: e.target.value,
                                }),
                              )
                            }
                            onFocus={() => markFocused("headerImageVariable")}
                            placeholder={t("headerImageUrlVariableNamePlaceholder")}
                            autoComplete="off"
                            spellCheck={false}
                            aria-invalid={
                              showErr(
                                "headerImageVariable",
                                fieldErrorKeys.headerImageVariable,
                              )
                                ? true
                                : undefined
                            }
                            aria-describedby={
                              showErr(
                                "headerImageVariable",
                                fieldErrorKeys.headerImageVariable,
                              )
                                ? "tpl-header-img-var-err"
                                : undefined
                            }
                          />
                          {showErr(
                            "headerImageVariable",
                            fieldErrorKeys.headerImageVariable,
                          ) ? (
                            <AlertCircle
                              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-danger"
                              strokeWidth={2}
                              aria-hidden
                            />
                          ) : null}
                        </div>
                        {showErr(
                          "headerImageVariable",
                          fieldErrorKeys.headerImageVariable,
                        ) ? (
                          <p
                            id="tpl-header-img-var-err"
                            className="mt-1 text-xs text-danger"
                            role="alert"
                          >
                            {tErr(fieldErrorKeys.headerImageVariable!)}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-fg-muted">
                          {t("headerImageUrlVariableNameHint")}
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <label htmlFor="tpl-header-img-url" className="ds-label">
                        {t("headerImageSampleUrl")}
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="tpl-header-img-url"
                          className={`ds-input mt-0 w-full ${inpErr(showErr("headerImage", fieldErrorKeys.headerImage))}`}
                          type="url"
                          inputMode="url"
                          value={state.headerImageSampleUrl}
                          onChange={(e) =>
                            setState((s) =>
                              syncHeaderImageSampleToNamedParam({
                                ...s,
                                headerImageSampleUrl: e.target.value,
                              }),
                            )
                          }
                          onFocus={() => markFocused("headerImage")}
                          placeholder="https://"
                          aria-invalid={
                            showErr("headerImage", fieldErrorKeys.headerImage)
                              ? true
                              : undefined
                          }
                          aria-describedby={
                            showErr("headerImage", fieldErrorKeys.headerImage)
                              ? "tpl-header-img-err"
                              : undefined
                          }
                        />
                        {showErr("headerImage", fieldErrorKeys.headerImage) ? (
                          <AlertCircle
                            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-danger"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      {showErr("headerImage", fieldErrorKeys.headerImage) ? (
                        <p
                          id="tpl-header-img-err"
                          className="mt-1 text-xs text-danger"
                          role="alert"
                        >
                          {tErr(fieldErrorKeys.headerImage!)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-fg-muted">
                        {t("headerImageSampleUrlHint")}
                      </p>
                      <p className="mt-1.5 text-xs text-fg-secondary">
                        {t("headerImageMetaAppIdHint")}
                      </p>
                    </div>
                  </div>
                ) : null}
                {state.headerKind === "text" ? (
                  <div className="mt-2">
                    <div className="relative">
                      <input
                        className={`ds-input mt-0 w-full ${inpErr(showErr("header", fieldErrorKeys.header))}`}
                        maxLength={60}
                        value={state.headerText}
                        onChange={(e) =>
                          setState((s) => ({ ...s, headerText: e.target.value }))
                        }
                        onFocus={() => markFocused("header")}
                        placeholder={t("headerTextPlaceholder")}
                        aria-invalid={showErr("header", fieldErrorKeys.header) ? true : undefined}
                        aria-describedby={
                          showErr("header", fieldErrorKeys.header) ? "tpl-header-err" : undefined
                        }
                      />
                      {showErr("header", fieldErrorKeys.header) ? (
                        <AlertCircle
                          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-danger"
                          strokeWidth={2}
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    {showErr("header", fieldErrorKeys.header) ? (
                      <p id="tpl-header-err" className="mt-1 text-xs text-danger" role="alert">
                        {tErr(fieldErrorKeys.header)}
                      </p>
                    ) : null}
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
                      tenantId={tenantId}
                      body={state.body}
                      headerKind={state.headerKind}
                      headerText={state.headerText}
                      contactVariables={contactVars}
                      allowCreateTenantFixed={canWriteTenantFixed}
                      onInsert={(snippet) => insertBodySnippet(snippet)}
                      onTenantFixedCreated={
                        canWriteTenantFixed
                          ? (item) => {
                              setTenantFixedLocal((prev) => {
                                if (
                                  prev.some(
                                    (p) =>
                                      p.key.toLowerCase() ===
                                      item.key.toLowerCase(),
                                  )
                                ) {
                                  return prev;
                                }
                                return [...prev, item];
                              });
                              setContactVars((prev) => {
                                const low = item.key.toLowerCase();
                                if (
                                  prev.some(
                                    (p) =>
                                      p.placeholder.toLowerCase() === low,
                                  )
                                ) {
                                  return prev;
                                }
                                return [
                                  ...prev,
                                  {
                                    placeholder: item.key,
                                    label: item.label,
                                    section: "tenant_fixed" as const,
                                    metaCompatible:
                                      isValidNamedTemplatePlaceholderName(
                                        item.key,
                                      ),
                                  },
                                ];
                              });
                              toast.success(t("variablePickerCreateFixedOk"));
                            }
                          : undefined
                      }
                    />
                  </div>
                </div>
                <div className="relative mt-1.5">
                  <textarea
                    ref={bodyRef}
                    id="tpl-body"
                    className={`ds-input mt-0 min-h-[180px] resize-y py-2 font-mono text-sm ${inpErr(showErr("body", fieldErrorKeys.body))}`}
                    value={state.body}
                    onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
                    onFocus={() => markFocused("body")}
                    maxLength={1024}
                    aria-invalid={showErr("body", fieldErrorKeys.body) ? true : undefined}
                    aria-describedby={
                      showErr("body", fieldErrorKeys.body) ? "tpl-body-err" : undefined
                    }
                  />
                  {showErr("body", fieldErrorKeys.body) ? (
                    <AlertCircle
                      className="pointer-events-none absolute right-3 top-3 size-4 text-danger"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : null}
                </div>
                {showErr("body", fieldErrorKeys.body) ? (
                  <p id="tpl-body-err" className="mt-1 text-xs text-danger" role="alert">
                    {tErr(fieldErrorKeys.body)}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-fg-muted">{state.body.length}/1024</p>
              </div>

              <div>
                <label htmlFor="tpl-footer" className="ds-label">
                  {t("fieldFooter")}
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="tpl-footer"
                    className={`ds-input mt-0 w-full ${inpErr(showErr("footer", fieldErrorKeys.footer))}`}
                    maxLength={60}
                    value={state.footer}
                    onChange={(e) => setState((s) => ({ ...s, footer: e.target.value }))}
                    onFocus={() => markFocused("footer")}
                    aria-invalid={showErr("footer", fieldErrorKeys.footer) ? true : undefined}
                    aria-describedby={
                      showErr("footer", fieldErrorKeys.footer) ? "tpl-footer-err" : undefined
                    }
                  />
                  {showErr("footer", fieldErrorKeys.footer) ? (
                    <AlertCircle
                      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-danger"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : null}
                </div>
                {showErr("footer", fieldErrorKeys.footer) ? (
                  <p id="tpl-footer-err" className="mt-1 text-xs text-danger" role="alert">
                    {tErr(fieldErrorKeys.footer)}
                  </p>
                ) : null}
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
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-500/30 transition hover:from-sky-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                    disabled={!canAddDraftButton(state.buttons, "url")}
                    title={
                      !canAddDraftButton(state.buttons, "url")
                        ? t("buttonsLimitHint")
                        : undefined
                    }
                    onClick={() => addButtonRow("url")}
                  >
                    <Link2 className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                    {t("addUrlButton")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                    disabled={!canAddDraftButton(state.buttons, "quick_reply")}
                    title={
                      !canAddDraftButton(state.buttons, "quick_reply")
                        ? t("buttonsLimitHint")
                        : undefined
                    }
                    onClick={() => addButtonRow("quick_reply")}
                  >
                    <Reply className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                    {t("addQrButton")}
                  </button>
                </div>
                <p className="text-xs text-fg-muted">{t("buttonsLimitsDoc")}</p>
                <ul className="space-y-4">
                  {state.buttons.map((b) => {
                    const labelKey = `btnLabel:${b.id}`;
                    const urlKey = `btnUrl:${b.id}`;
                    const labelCode = fieldErrorKeys[labelKey];
                    const urlCode = fieldErrorKeys[urlKey];
                    const labelErr = showErr(labelKey, labelCode);
                    const urlErr = showErr(urlKey, urlCode);
                    return (
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
                      <div className="relative mt-2">
                        <input
                          className={`ds-input mt-0 w-full font-medium ${inpErr(labelErr)}`}
                          placeholder={t("btnLabelPlaceholder")}
                          maxLength={25}
                          value={b.text}
                          onChange={(e) => updateButton(b.id, { text: e.target.value })}
                          onFocus={() => markFocused(labelKey)}
                          aria-invalid={labelErr ? true : undefined}
                          aria-describedby={labelErr ? `btn-label-err-${b.id}` : undefined}
                        />
                        {labelErr ? (
                          <AlertCircle
                            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-danger"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      {labelErr ? (
                        <p
                          id={`btn-label-err-${b.id}`}
                          className="mt-1 text-xs text-danger"
                          role="alert"
                        >
                          {tErr(labelCode!)}
                        </p>
                      ) : null}
                      {b.kind === "url" ? (
                        <div className="mt-3 space-y-2">
                          <label className="ds-label text-xs" htmlFor={`url-${b.id}`}>
                            {t("urlFieldLabel")}
                          </label>
                          <div
                            className={`relative mt-0 flex min-h-10 w-full items-stretch overflow-hidden rounded-lg border border-border-strong bg-card font-mono text-sm transition-[color,box-shadow,border-color] duration-150 focus-within:border-primary-600 focus-within:ring-2 focus-within:ring-primary-100 ${
                              urlErr ? "border-danger/90 ring-2 ring-danger/25" : ""
                            }`}
                          >
                            <span
                              className="flex shrink-0 select-none items-center border-r border-border-strong bg-neutral-50 px-3 text-fg-muted"
                              aria-hidden
                            >
                              https://
                            </span>
                            <div className="relative min-w-0 flex-1">
                              <input
                                id={`url-${b.id}`}
                                className={`h-10 w-full border-0 bg-transparent px-3 text-fg outline-none focus:ring-0 ${urlErr ? "pr-9" : ""}`}
                                placeholder={t("urlFieldPlaceholderRest")}
                                value={httpsEditableRest(b.url)}
                                onChange={(e) =>
                                  updateButton(b.id, {
                                    url: fullUrlFromEditableRest(e.target.value),
                                  } as DraftButton)
                                }
                                onFocus={() => markFocused(urlKey)}
                                onPaste={(e) => {
                                  const text = e.clipboardData.getData("text").trim();
                                  const low = text.toLowerCase();
                                  let rest = text;
                                  if (low.startsWith("https://")) rest = text.slice(8);
                                  else if (low.startsWith("http://")) rest = text.slice(7);
                                  updateButton(b.id, {
                                    url: fullUrlFromEditableRest(rest),
                                  } as DraftButton);
                                  e.preventDefault();
                                }}
                                onBlur={() => {
                                  const u = normalizeUrlWithHttps(b.url);
                                  if (u !== b.url) {
                                    updateButton(b.id, { url: u } as DraftButton);
                                  }
                                }}
                                aria-invalid={urlErr ? true : undefined}
                                aria-describedby={urlErr ? `btn-url-err-${b.id}` : undefined}
                              />
                              {urlErr ? (
                                <AlertCircle
                                  className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-danger"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              ) : null}
                            </div>
                          </div>
                          {urlErr ? (
                            <p
                              id={`btn-url-err-${b.id}`}
                              className="text-xs text-danger"
                              role="alert"
                            >
                              {tErr(urlCode!)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>

          {sampleFields.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="ds-section-title text-base">{t("sectionSamples")}</h2>
              <p className="mt-1 text-sm text-fg-secondary">{t("samplesPrivacy")}</p>
              <div className="mt-4 space-y-3 [contain:layout]">
                {sampleFields.map((f) => {
                  const sKey = `sample:${f.sampleKey}`;
                  const sCode = fieldErrorKeys[sKey];
                  const sErrVis = showErr(sKey, sCode);
                  return (
                    <div key={f.sampleKey}>
                      <label className="ds-label text-xs" htmlFor={`s-${f.sampleKey}`}>
                        {f.hint}
                      </label>
                      <div className="relative mt-1">
                        <input
                          id={`s-${f.sampleKey}`}
                          className={`ds-input mt-0 w-full text-base md:text-sm ${inpErr(sErrVis)}`}
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
                          onFocus={() => markFocused(sKey)}
                          aria-invalid={sErrVis ? true : undefined}
                          aria-describedby={sErrVis ? `s-err-${f.sampleKey}` : undefined}
                        />
                        {sErrVis ? (
                          <AlertCircle
                            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-danger"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      {sErrVis ? (
                        <p
                          id={`s-err-${f.sampleKey}`}
                          className="mt-1 text-xs text-danger"
                          role="alert"
                        >
                          {tErr(sCode!)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

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
              className="ds-btn-whatsapp-sm"
              disabled={savingDraft}
              onClick={() => void saveDraft()}
            >
              {savingDraft ? t("savingDraft") : t("saveDraft")}
            </button>
            <button
              type="button"
              className="ds-btn-primary"
              disabled={
                sendingMeta ||
                !integrationConfigured ||
                !validation.ok ||
                hasFieldErrors
              }
              onClick={() => {
                setMetaSubmitOutcome(null);
                setConfirmMetaOpen(true);
              }}
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
          onClick={() => !sendingMeta && closeMetaDialog()}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-meta-title" className="font-display text-lg font-semibold text-fg">
              {sendingMeta
                ? t("sendingMeta")
                : metaSubmitOutcome?.kind === "success"
                  ? t("sendMetaResultSuccessTitle")
                  : metaSubmitOutcome?.kind === "error"
                    ? t("sendMetaResultErrorTitle")
                    : t("confirmMetaTitle")}
            </h2>
            {sendingMeta ? (
              <div className="mt-5 space-y-4">
                <div
                  className="relative h-2.5 w-full overflow-hidden rounded-full bg-neutral-200"
                  role="progressbar"
                  aria-busy="true"
                  aria-valuetext={t(
                    metaSendPhaseKeys[
                      Math.min(metaSendPhase, metaSendPhaseKeys.length - 1)
                    ]!,
                  )}
                >
                  <div className="tpl-meta-progress-bar absolute left-0 top-0 h-full w-[40%] rounded-full bg-gradient-to-r from-primary-600 to-primary-400 shadow-sm" />
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-3">
                  <Loader2
                    className="mt-0.5 size-5 shrink-0 animate-spin text-primary-600"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <p className="text-sm leading-relaxed text-fg-secondary">
                    {t(
                      metaSendPhaseKeys[
                        Math.min(metaSendPhase, metaSendPhaseKeys.length - 1)
                      ]!,
                    )}
                  </p>
                </div>
              </div>
            ) : metaSubmitOutcome?.kind === "success" ? (
              <div className="mt-5 space-y-4" role="status" aria-live="polite">
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-3 py-3">
                  <CheckCircle2
                    className="mt-0.5 size-6 shrink-0 text-emerald-600"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <p className="text-sm leading-relaxed text-emerald-950">
                    {t("sendMetaResultSuccessBody", {
                      name: metaSubmitOutcome.templateName,
                    })}
                  </p>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="ds-btn-outline"
                    onClick={() => closeMetaDialog()}
                  >
                    {t("sendMetaResultClose")}
                  </button>
                  <button
                    type="button"
                    className="ds-btn-primary"
                    onClick={() => goToTemplatesAfterSuccess()}
                  >
                    {t("sendMetaResultGoToList")}
                  </button>
                </div>
              </div>
            ) : metaSubmitOutcome?.kind === "error" ? (
              <div className="mt-5 space-y-4" role="alert" aria-live="assertive">
                <div className="flex items-start gap-3 rounded-xl border border-red-200/90 bg-red-50/80 px-3 py-3">
                  <AlertCircle
                    className="mt-0.5 size-6 shrink-0 text-red-600"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <p className="text-sm leading-relaxed text-red-950">
                    {metaSubmitOutcome.message}
                  </p>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="ds-btn-outline"
                    onClick={() => closeMetaDialog()}
                  >
                    {t("sendMetaResultClose")}
                  </button>
                  <button
                    type="button"
                    className="ds-btn-primary"
                    onClick={() => {
                      setMetaSubmitOutcome(null);
                    }}
                  >
                    {t("sendMetaResultRetry")}
                  </button>
                </div>
              </div>
            ) : (
              <>
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
                    onClick={() => closeMetaDialog()}
                  >
                    {t("confirmCancel")}
                  </button>
                  <button
                    type="button"
                    className="ds-btn-primary"
                    onClick={() => void submitToMeta()}
                  >
                    {t("confirmSend")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
