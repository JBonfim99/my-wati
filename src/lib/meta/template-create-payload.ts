/**
 * Form state → payload Meta (create template) + rascunho JSONB + validação.
 */

import type { MessageTemplateRecord } from "@/lib/meta/graph";
import {
  extractEditableTemplateFields,
  extractHeaderTextForPreview,
} from "@/lib/meta/template-edit-build";
import {
  slugifyTemplateName,
  suggestDuplicateTemplateName,
} from "@/lib/meta/template-components";

export const DB_TEMPLATE_DRAFT_STATUS = "DB_DRAFT" as const;

export const TEMPLATE_FORM_SCHEMA_VERSION = 1;

export type ParameterFormatChoice = "named" | "positional";

export type DraftButton =
  | {
      id: string;
      kind: "url";
      text: string;
      mode: "static";
      url: string;
    }
  | {
      id: string;
      kind: "url";
      text: string;
      mode: "dynamic";
      baseUrl: string;
      /**
       * Texto colado ao fim da URL base antes de {{1}} (path, query, etc.).
       */
      suffixVariableLabel: string;
    }
  | { id: string; kind: "quick_reply"; text: string }
  | { id: string; kind: "phone"; text: string; phone: string };

export type TemplateFormState = {
  schemaVersion: number;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  parameterFormat: ParameterFormatChoice;
  headerKind: "none" | "text";
  headerText: string;
  body: string;
  footer: string;
  buttonsEnabled: boolean;
  buttons: DraftButton[];
  /** named: param name → sample; positional body: "p1","p2" for {{1}},{{2}}; URL dynamic: url_<buttonIndex> */
  samples: Record<string, string>;
};

const BODY_MAX = 1024;
const FOOTER_MAX = 60;
const HEADER_MAX = 60;
const BTN_LABEL_MAX = 25;
const URL_MAX = 2000;
const PHONE_BTN_MAX = 20;
/** Limite total de botões por modelo (WhatsApp Business Platform). */
const BUTTONS_TOTAL_MAX = 10;

const NAMED_PH = /\{\{([a-z][a-z0-9_]*)\}\}/g;
const POS_PH = /\{\{(\d+)\}\}/g;

/** Nome de variável nomeada aceito pela Meta em {{nome}} (corpo/cabeçalho). */
export function isValidNamedTemplatePlaceholderName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name.trim());
}

function newBtnId(): string {
  return `b-${crypto.randomUUID()}`;
}

export function defaultTemplateFormState(): TemplateFormState {
  return {
    schemaVersion: TEMPLATE_FORM_SCHEMA_VERSION,
    name: "",
    language: "pt_BR",
    category: "MARKETING",
    parameterFormat: "named",
    headerKind: "none",
    headerText: "",
    body: "",
    footer: "",
    buttonsEnabled: false,
    buttons: [],
    samples: {},
  };
}

export function parseTemplateFormPayload(raw: unknown): TemplateFormState {
  const base = defaultTemplateFormState();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const pf = o.parameterFormat === "positional" ? "positional" : "named";
  const cat = o.category;
  const category =
    cat === "UTILITY" || cat === "AUTHENTICATION" || cat === "MARKETING"
      ? cat
      : base.category;
  const buttonsRaw = o.buttons;
  const buttons: DraftButton[] = [];
  if (Array.isArray(buttonsRaw)) {
    for (const b of buttonsRaw) {
      if (!b || typeof b !== "object") continue;
      const x = b as Record<string, unknown>;
      const id = typeof x.id === "string" ? x.id : newBtnId();
      const kind = x.kind === "quick_reply" ? "quick_reply" : x.kind === "phone" ? "phone" : "url";
      const text = typeof x.text === "string" ? x.text : "";
      if (kind === "quick_reply") {
        buttons.push({ id, kind: "quick_reply", text });
      } else if (kind === "phone") {
        buttons.push({
          id,
          kind: "phone",
          text,
          phone: typeof x.phone === "string" ? x.phone : "",
        });
      } else {
        const mode = x.mode === "dynamic" ? "dynamic" : "static";
        if (mode === "dynamic") {
          buttons.push({
            id,
            kind: "url",
            text,
            mode: "dynamic",
            baseUrl: typeof x.baseUrl === "string" ? x.baseUrl : "",
            suffixVariableLabel:
              typeof x.suffixVariableLabel === "string"
                ? x.suffixVariableLabel
                : "",
          });
        } else {
          buttons.push({
            id,
            kind: "url",
            text,
            mode: "static",
            url: typeof x.url === "string" ? x.url : "",
          });
        }
      }
    }
  }
  const samples =
    o.samples && typeof o.samples === "object" && !Array.isArray(o.samples)
      ? { ...(o.samples as Record<string, string>) }
      : {};
  return {
    schemaVersion:
      typeof o.schemaVersion === "number"
        ? o.schemaVersion
        : TEMPLATE_FORM_SCHEMA_VERSION,
    name: typeof o.name === "string" ? o.name : "",
    language: typeof o.language === "string" ? o.language : base.language,
    category,
    parameterFormat: pf,
    headerKind: o.headerKind === "text" ? "text" : "none",
    headerText: typeof o.headerText === "string" ? o.headerText : "",
    body: typeof o.body === "string" ? o.body : "",
    footer: typeof o.footer === "string" ? o.footer : "",
    buttonsEnabled: Boolean(o.buttonsEnabled),
    buttons,
    samples,
  };
}

export function serializeDraftPayload(state: TemplateFormState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

/** Placeholders nomeados (ordem de aparição, únicos). */
export function extractNamedPlaceholders(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  NAMED_PH.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NAMED_PH.exec(text))) {
    const name = m[1]!;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Placeholders posicionais na ordem de primeira aparição. */
export function extractPositionalPlaceholders(text: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  POS_PH.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = POS_PH.exec(text))) {
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1) continue;
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function hasPositional(text: string): boolean {
  POS_PH.lastIndex = 0;
  return POS_PH.test(text);
}

function hasNamed(text: string): boolean {
  NAMED_PH.lastIndex = 0;
  return NAMED_PH.test(text);
}

export function urlSuffixSampleKey(buttonIndex: number): string {
  return `url_${buttonIndex}`;
}

/** Parte fixa da URL dinâmica (antes de {{1}}): URL base + sufixo do formulário. */
export function dynamicUrlStaticPrefix(
  baseUrl: string,
  suffixSegment: string,
): string {
  return `${baseUrl.trim()}${suffixSegment.trim()}`;
}

/** Campos de exemplo exigidos pela Meta (corpo, cabeçalho, sufixo de URL dinâmica). */
export function getSampleFieldDescriptors(state: TemplateFormState): {
  sampleKey: string;
  hint: string;
}[] {
  const out: { sampleKey: string; hint: string }[] = [];
  const push = (k: string, h: string) => {
    if (out.some((x) => x.sampleKey === k)) return;
    out.push({ sampleKey: k, hint: h });
  };
  const pf = state.parameterFormat;
  if (pf === "named") {
    for (const n of extractNamedPlaceholders(state.body)) {
      push(n, `Corpo {{${n}}}`);
    }
    for (const n of extractNamedPlaceholders(state.headerText)) {
      push(`header_${n}`, `Cabeçalho {{${n}}}`);
    }
  } else {
    for (const n of extractPositionalPlaceholders(state.body)) {
      push(`p${n}`, `Corpo {{${n}}}`);
    }
    for (const n of extractPositionalPlaceholders(state.headerText)) {
      push(`header_p${n}`, `Cabeçalho {{${n}}}`);
    }
  }
  return out;
}

export function orderButtonsForMeta(buttons: DraftButton[]): DraftButton[] {
  const nonQr = buttons.filter((b) => b.kind === "url" || b.kind === "phone");
  const qr = buttons.filter((b) => b.kind === "quick_reply");
  return [...nonQr, ...qr];
}

/** Limites oficiais: até 10 botões no total; até 2 URL, 1 telefone, 10 respostas rápidas. */
export function canAddDraftButton(
  buttons: DraftButton[],
  kind: "url" | "quick_reply" | "phone",
): boolean {
  const ordered = orderButtonsForMeta(buttons);
  if (ordered.length >= BUTTONS_TOTAL_MAX) return false;
  if (kind === "url") {
    return buttons.filter((b) => b.kind === "url").length < 2;
  }
  if (kind === "phone") {
    return !buttons.some((b) => b.kind === "phone");
  }
  return buttons.filter((b) => b.kind === "quick_reply").length < 10;
}

function normalizeButtonLabelKey(text: string): string {
  return text.trim().toLowerCase();
}

function buildBodyComponent(
  state: TemplateFormState,
  issues: string[],
): unknown | null {
  const text = state.body.trim();
  if (!text) {
    issues.push("O corpo da mensagem é obrigatório.");
    return null;
  }
  if (text.length > BODY_MAX) {
    issues.push(`O corpo excede ${BODY_MAX} caracteres.`);
    return null;
  }
  const pf = state.parameterFormat;
  if (pf === "named") {
    if (hasPositional(text)) {
      issues.push("Com parâmetros nomeados, não use {{1}}, {{2}} no corpo — use {{nome_do_param}}.");
      return null;
    }
    const names = extractNamedPlaceholders(text);
    const exampleParams: { param_name: string; example: string }[] = [];
    for (const n of names) {
      const ex = (state.samples[n] ?? "").trim();
      if (!ex) {
        issues.push(`Informe o conteúdo de exemplo para {{${n}}} na seção de amostras.`);
        continue;
      }
      exampleParams.push({ param_name: n, example: ex });
    }
    if (exampleParams.length !== names.length) return null;
    return exampleParams.length
      ? { type: "BODY", text, example: { body_text_named_params: exampleParams } }
      : { type: "BODY", text };
  }
  if (hasNamed(text)) {
    issues.push("Com parâmetros posicionais, use apenas {{1}}, {{2}}, … no corpo.");
    return null;
  }
  const order = extractPositionalPlaceholders(text);
  const values: string[] = [];
  for (const num of order) {
    const key = `p${num}`;
    const ex = (state.samples[key] ?? "").trim();
    if (!ex) {
      issues.push(`Informe o conteúdo de exemplo para {{${num}}} na seção de amostras.`);
      continue;
    }
    values.push(ex);
  }
  if (order.length !== values.length) return null;
  return order.length
    ? { type: "BODY", text, example: { body_text: [values] } }
    : { type: "BODY", text };
}

function buildHeaderComponent(
  state: TemplateFormState,
  issues: string[],
): unknown | null {
  if (state.headerKind !== "text") return null;
  const text = state.headerText.trim();
  if (!text) return null;
  if (text.length > HEADER_MAX) {
    issues.push(`O cabeçalho excede ${HEADER_MAX} caracteres.`);
    return null;
  }
  const pf = state.parameterFormat;
  if (pf === "named") {
    const names = extractNamedPlaceholders(text);
    const pos = extractPositionalPlaceholders(text);
    if (pos.length) {
      issues.push("No cabeçalho, com parâmetros nomeados, não use números em {{ }}.");
      return null;
    }
    if (names.length > 1) {
      issues.push("O cabeçalho admite no máximo uma variável.");
      return null;
    }
    if (names.length === 1) {
      const n = names[0]!;
      const ex = (state.samples[`header_${n}`] ?? state.samples[n] ?? "").trim();
      if (!ex) {
        issues.push(`Informe o exemplo para a variável do cabeçalho {{${n}}}.`);
        return null;
      }
      return {
        type: "HEADER",
        format: "TEXT",
        text,
        example: { header_text_named_params: [{ param_name: n, example: ex }] },
      };
    }
    return { type: "HEADER", format: "TEXT", text };
  }
  const pos = extractPositionalPlaceholders(text);
  const names = extractNamedPlaceholders(text);
  if (names.length) {
    issues.push("No cabeçalho posicional use apenas {{1}}.");
    return null;
  }
  if (pos.length > 1) {
    issues.push("O cabeçalho admite no máximo uma variável.");
    return null;
  }
  if (pos.length === 1) {
    const key = `p${pos[0]}`;
    const ex = (state.samples[`header_p${pos[0]}`] ?? state.samples[key] ?? "").trim();
    if (!ex) {
      issues.push("Informe o exemplo para a variável do cabeçalho.");
      return null;
    }
    return {
      type: "HEADER",
      format: "TEXT",
      text,
      example: { header_text: [ex] },
    };
  }
  return { type: "HEADER", format: "TEXT", text };
}

function buildFooterComponent(state: TemplateFormState, issues: string[]): unknown | null {
  const text = state.footer.trim();
  if (!text) return null;
  if (text.length > FOOTER_MAX) {
    issues.push(`O rodapé excede ${FOOTER_MAX} caracteres.`);
    return null;
  }
  return { type: "FOOTER", text };
}

function buildButtonsComponent(
  state: TemplateFormState,
  issues: string[],
): unknown | null {
  if (!state.buttonsEnabled) return null;
  const ordered = orderButtonsForMeta(state.buttons);
  if (ordered.length > BUTTONS_TOTAL_MAX) {
    issues.push(
      `No máximo ${BUTTONS_TOTAL_MAX} botões por modelo (limite da plataforma WhatsApp).`,
    );
    return null;
  }

  const labelKeys = ordered
    .map((b) => normalizeButtonLabelKey(b.text))
    .filter(Boolean);
  const labelSet = new Set<string>();
  for (const k of labelKeys) {
    if (labelSet.has(k)) {
      issues.push("Dois botões não podem ter o mesmo rótulo.");
      return null;
    }
    labelSet.add(k);
  }

  let urlCount = 0;
  let phoneCount = 0;
  let qrCount = 0;
  const built: unknown[] = [];
  let urlOrdinal = 0;
  for (const b of ordered) {
    const label = b.text.trim();
    if (!label) {
      issues.push("Cada botão precisa de um rótulo.");
      continue;
    }
    if (label.length > BTN_LABEL_MAX) {
      issues.push(`Rótulo de botão excede ${BTN_LABEL_MAX} caracteres.`);
      continue;
    }
    if (b.kind === "url") {
      urlCount++;
      if (urlCount > 2) {
        issues.push("No máximo 2 botões do tipo URL.");
        continue;
      }
      if (b.mode === "static") {
        const u = b.url.trim();
        if (!u) {
          issues.push("URL do botão não pode ficar vazia.");
          continue;
        }
        if (u.length > URL_MAX) {
          issues.push("URL do botão excede o limite.");
          continue;
        }
        built.push({ type: "URL", text: label, url: u });
      } else {
        const base = b.baseUrl.trim();
        if (!base) {
          issues.push("URL base do botão dinâmico é obrigatória.");
          continue;
        }
        const prefix = dynamicUrlStaticPrefix(b.baseUrl, b.suffixVariableLabel);
        const sampleKey = urlSuffixSampleKey(urlOrdinal);
        urlOrdinal++;
        const suffix = (state.samples[sampleKey] ?? "").trim();
        if (!suffix) {
          issues.push(
            `Informe o conteúdo de exemplo do sufixo da URL no botão «${label}».`,
          );
          continue;
        }
        const fullUrl = `${prefix}{{1}}`.slice(0, URL_MAX);
        built.push({
          type: "URL",
          text: label,
          url: fullUrl,
          example: [suffix],
        });
      }
    } else if (b.kind === "phone") {
      phoneCount++;
      if (phoneCount > 1) {
        issues.push("No máximo 1 botão de telefone.");
        continue;
      }
      const phone = b.phone.replace(/\D/g, "").trim();
      if (!phone) {
        issues.push("Número do botão de telefone é obrigatório.");
        continue;
      }
      if (phone.length > PHONE_BTN_MAX) {
        issues.push("Número do telefone excede o limite permitido pela Meta.");
        continue;
      }
      built.push({ type: "PHONE_NUMBER", text: label, phone_number: phone });
    } else {
      qrCount++;
      if (qrCount > 10) {
        issues.push("No máximo 10 respostas rápidas.");
        continue;
      }
      built.push({ type: "QUICK_REPLY", text: label });
    }
  }
  return built.length ? { type: "BUTTONS", buttons: built } : null;
}

export type MetaSubmitPayload = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  parameter_format?: string;
  components: unknown[];
};

export function validateForMetaSubmit(state: TemplateFormState): {
  ok: true;
  payload: MetaSubmitPayload;
} | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const name = slugifyTemplateName(state.name);
  if (!name) issues.push("Informe um nome válido para o modelo (letras minúsculas, números e _).");

  const lang = state.language.trim().replace(/-/g, "_");
  if (!lang) issues.push("Selecione o idioma do modelo.");

  const components: unknown[] = [];
  const body = buildBodyComponent(state, issues);
  if (body) components.push(body);

  const header = buildHeaderComponent(state, issues);
  if (header) components.push(header);

  const footer = buildFooterComponent(state, issues);
  if (footer) components.push(footer);

  const buttons = buildButtonsComponent(state, issues);
  if (buttons) components.push(buttons);

  const hasBody = components.some(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      String((c as { type?: string }).type).toUpperCase() === "BODY",
  );
  if (!hasBody && !issues.some((i) => i.includes("corpo"))) {
    issues.push("O corpo da mensagem é obrigatório.");
  }

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    payload: {
      name,
      language: lang,
      category: state.category,
      parameter_format: state.parameterFormat,
      components,
    },
  };
}

/** Componentes mínimos para prévia / listagem (sem blocos example). */
export function componentsFromFormStateForPreview(state: TemplateFormState): unknown[] {
  const out: unknown[] = [];
  const body = state.body.trim();
  if (body) out.push({ type: "BODY", text: body });
  if (state.headerKind === "text" && state.headerText.trim()) {
    out.push({
      type: "HEADER",
      format: "TEXT",
      text: state.headerText.trim(),
    });
  }
  if (state.footer.trim()) {
    out.push({ type: "FOOTER", text: state.footer.trim() });
  }
  if (state.buttonsEnabled && state.buttons.length) {
    let dynUrlIdx = 0;
    const buttons = orderButtonsForMeta(state.buttons).map((b) => {
      if (b.kind === "url") {
        if (b.mode === "static") {
          return { type: "URL", text: b.text.trim(), url: b.url.trim() };
        }
        const sk = urlSuffixSampleKey(dynUrlIdx);
        dynUrlIdx++;
        const suf = (state.samples[sk] ?? "").trim();
        const prefix = dynamicUrlStaticPrefix(b.baseUrl, b.suffixVariableLabel);
        return {
          type: "URL",
          text: b.text.trim(),
          url: suf ? `${prefix}${suf}` : `${prefix}{{1}}`,
        };
      }
      if (b.kind === "phone") {
        return {
          type: "PHONE_NUMBER",
          text: b.text.trim(),
          phone_number: b.phone.replace(/\D/g, ""),
        };
      }
      return { type: "QUICK_REPLY", text: b.text.trim() };
    });
    out.push({ type: "BUTTONS", buttons });
  }
  return out;
}

/** Corrige índice url para sample keys — usado no form client. */
export function urlDynamicSampleKeyForButton(
  buttons: DraftButton[],
  buttonId: string,
): string {
  const ordered = orderButtonsForMeta(buttons);
  let u = 0;
  for (const b of ordered) {
    if (b.kind !== "url") continue;
    if (b.mode !== "dynamic") continue;
    if (b.id === buttonId) return urlSuffixSampleKey(u);
    u++;
  }
  return urlSuffixSampleKey(0);
}

export function draftRowToMessageTemplateRecord(row: {
  id: string;
  payload: unknown;
  updatedAt: Date;
}): MessageTemplateRecord {
  const state = parseTemplateFormPayload(row.payload);
  const name = state.name.trim() || "—";
  const comps = componentsFromFormStateForPreview(state);
  return {
    id: `draft-${row.id}`,
    name,
    status: DB_TEMPLATE_DRAFT_STATUS,
    category: state.category,
    language: state.language,
    parameter_format: state.parameterFormat === "named" ? "named" : "positional",
    components: comps,
    last_updated_time: String(Math.floor(row.updatedAt.getTime() / 1000)),
  };
}

export function isDbTemplateDraft(tpl: MessageTemplateRecord): boolean {
  return Boolean(tpl.id?.startsWith("draft-"));
}

export function parseDraftUuidFromTemplateId(id: string | undefined): string | null {
  if (!id?.startsWith("draft-")) return null;
  const u = id.slice("draft-".length);
  return u.length > 0 ? u : null;
}

/** Duplicar modelo da Meta (lista) → estado do formulário de criação (rascunho no servidor). */
export function templateRecordToFormStateForDuplicate(
  tpl: MessageTemplateRecord,
): TemplateFormState {
  const s = defaultTemplateFormState();
  s.name = suggestDuplicateTemplateName(tpl.name ?? "template");
  if (tpl.language?.trim()) s.language = tpl.language.trim().replace(/-/g, "_");
  const cat = (tpl.category ?? "").toUpperCase();
  if (cat === "UTILITY" || cat === "AUTHENTICATION" || cat === "MARKETING") {
    s.category = cat;
  }
  s.parameterFormat =
    tpl.parameter_format === "positional" ? "positional" : "named";

  const parts = extractEditableTemplateFields(tpl.components);
  s.body = parts.body;
  s.footer = parts.footer;
  const ht = extractHeaderTextForPreview(tpl.components).trim();
  if (ht) {
    s.headerKind = "text";
    s.headerText = ht;
  }

  const draftButtons: DraftButton[] = [];
  if (Array.isArray(tpl.components)) {
    for (const c of tpl.components) {
      if (String((c as { type?: string }).type).toUpperCase() !== "BUTTONS") {
        continue;
      }
      const raw = (c as { buttons?: unknown[] }).buttons;
      if (!Array.isArray(raw)) continue;
      for (const btn of raw) {
        if (!btn || typeof btn !== "object") continue;
        const bt = String((btn as { type?: string }).type ?? "")
          .toUpperCase()
          .trim();
        const text = String((btn as { text?: string }).text ?? "").trim();
        if (!text) continue;
        const id = `b-${crypto.randomUUID()}`;
        if (bt === "URL") {
          const urlVal = (btn as { url?: unknown }).url;
          let url = "";
          if (typeof urlVal === "string") url = urlVal;
          else if (
            urlVal &&
            typeof urlVal === "object" &&
            "base_url" in urlVal &&
            typeof (urlVal as { base_url: string }).base_url === "string"
          ) {
            url = (urlVal as { base_url: string }).base_url;
          }
          const dyn = /\{\{1\}\}\s*$/.test(url);
          if (dyn) {
            draftButtons.push({
              id,
              kind: "url",
              text,
              mode: "dynamic",
              baseUrl: url.replace(/\{\{1\}\}\s*$/, ""),
              suffixVariableLabel: "",
            });
          } else {
            draftButtons.push({ id, kind: "url", text, mode: "static", url });
          }
        } else if (bt === "QUICK_REPLY") {
          draftButtons.push({ id, kind: "quick_reply", text });
        } else if (bt === "PHONE_NUMBER") {
          draftButtons.push({
            id,
            kind: "phone",
            text,
            phone: String((btn as { phone_number?: string }).phone_number ?? ""),
          });
        }
      }
    }
  }
  s.buttons = draftButtons;
  s.buttonsEnabled = draftButtons.length > 0;
  return s;
}
