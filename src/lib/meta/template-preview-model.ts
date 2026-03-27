/**
 * Modelo de dados para o preview estilo WhatsApp / Wati (header, body, footer, botões).
 */

import type { TemplateFormState } from "@/lib/meta/template-create-payload";

export type PreviewHeader =
  | { kind: "none" }
  | { kind: "text"; text: string }
  | { kind: "image"; src?: string; variable?: boolean }
  | { kind: "video" }
  | { kind: "document" };

export type PreviewButton =
  | { kind: "url"; text: string; href?: string }
  | { kind: "quick_reply"; text: string };

export type TemplatePreviewModel = {
  header: PreviewHeader;
  body: string;
  footer: string;
  buttons: PreviewButton[];
};

const NAMED_PH = /\{\{([a-z][a-z0-9_]*)\}\}/g;
const POS_PH = /\{\{(\d+)\}\}/g;

function resolveBodyText(text: string, state: TemplateFormState): string {
  const { samples } = state;
  if (state.parameterFormat === "named") {
    return text.replace(NAMED_PH, (_, name: string) => samples[name] ?? `{{${name}}}`);
  }
  return text.replace(POS_PH, (_, d: string) => samples[`p${d}`] ?? `{{${d}}}`);
}

function resolveHeaderText(text: string, state: TemplateFormState): string {
  const { samples } = state;
  if (state.parameterFormat === "named") {
    return text.replace(NAMED_PH, (_, name: string) =>
      samples[`header_${name}`] ?? samples[name] ?? `{{${name}}}`,
    );
  }
  return text.replace(POS_PH, (_, d: string) =>
    samples[`header_p${d}`] ?? samples[`p${d}`] ?? `{{${d}}}`,
  );
}

function compType(c: unknown): string {
  if (!c || typeof c !== "object" || !("type" in c)) return "";
  return String((c as { type: string }).type).toUpperCase();
}

function readButtonUrl(btn: { url?: unknown }): string | undefined {
  const urlVal = btn.url;
  if (typeof urlVal === "string" && urlVal.trim()) return urlVal.trim();
  if (
    urlVal &&
    typeof urlVal === "object" &&
    "base_url" in urlVal &&
    typeof (urlVal as { base_url: string }).base_url === "string"
  ) {
    return (urlVal as { base_url: string }).base_url.trim();
  }
  return undefined;
}

/**
 * Extrai estrutura para preview (texto, mídia no header, tipos de botão).
 */
export function parseTemplatePreviewModel(
  components: unknown,
): TemplatePreviewModel {
  const out: TemplatePreviewModel = {
    header: { kind: "none" },
    body: "",
    footer: "",
    buttons: [],
  };
  if (!Array.isArray(components)) return out;

  for (const c of components) {
    const t = compType(c);
    if (t === "HEADER") {
      const fmt = String((c as { format?: string }).format ?? "TEXT").toUpperCase();
      const text = (c as { text?: string }).text;
      if (fmt === "TEXT" && typeof text === "string" && text.trim()) {
        out.header = { kind: "text", text: text.trim() };
      } else if (fmt === "IMAGE") {
        const ex = (c as { example?: { header_url?: unknown } }).example
          ?.header_url;
        const u =
          Array.isArray(ex) && typeof ex[0] === "string" ? ex[0].trim() : "";
        out.header = {
          kind: "image",
          variable: false,
          ...(u ? { src: u } : {}),
        };
      } else if (fmt === "VIDEO") {
        out.header = { kind: "video" };
      } else if (fmt === "DOCUMENT") {
        out.header = { kind: "document" };
      }
    }
    if (t === "BODY" && typeof (c as { text?: string }).text === "string") {
      out.body = (c as { text: string }).text;
    }
    if (t === "FOOTER" && typeof (c as { text?: string }).text === "string") {
      out.footer = (c as { text: string }).text.trim();
    }
    if (t === "BUTTONS") {
      const raw = (c as { buttons?: unknown[] }).buttons;
      if (!Array.isArray(raw)) continue;
      for (const btn of raw) {
        if (!btn || typeof btn !== "object") continue;
        const bt = String((btn as { type?: string }).type ?? "")
          .toUpperCase()
          .trim();
        const text = String((btn as { text?: string }).text ?? "").trim();
        if (!text) continue;
        if (bt === "URL") {
          out.buttons.push({
            kind: "url",
            text,
            href: readButtonUrl(btn as { url?: unknown }),
          });
        } else if (bt === "QUICK_REPLY") {
          out.buttons.push({ kind: "quick_reply", text });
        }
      }
    }
  }
  return out;
}

/** Substitui placeholders do modelo de prévia pelos exemplos do formulário. */
export function applySamplesToTemplatePreviewModel(
  model: TemplatePreviewModel,
  state: TemplateFormState,
): TemplatePreviewModel {
  const { samples } = state;
  const buttons: PreviewButton[] = model.buttons.map((b) => {
    if (b.kind !== "url") return { ...b };
    const href = b.href;
    if (!href || !href.includes("{{")) return { ...b };
    if (state.parameterFormat === "named") {
      return {
        ...b,
        href: href.replace(NAMED_PH, (_, name: string) =>
          samples[name]?.trim() ? samples[name]! : `{{${name}}}`,
        ),
      };
    }
    return {
      ...b,
      href: href.replace(POS_PH, (_, d: string) =>
        samples[`p${d}`]?.trim() ? samples[`p${d}`]! : `{{${d}}}`,
      ),
    };
  });

  let header: PreviewHeader =
    model.header.kind === "text"
      ? {
          kind: "text",
          text: resolveHeaderText(model.header.text, state),
        }
      : model.header;

  if (model.header.kind === "image" && state.headerKind === "image") {
    const vn =
      state.headerImageBinding === "variable" &&
      state.parameterFormat === "named"
        ? state.headerImageUrlVariableName.trim()
        : "";
    const fromSample = vn ? (state.samples[vn] ?? "").trim() : "";
    const src = fromSample || state.headerImageSampleUrl.trim();
    header = {
      kind: "image",
      variable: state.headerImageBinding === "variable",
      ...(src ? { src } : {}),
    };
  }

  return {
    header,
    body: resolveBodyText(model.body, state),
    footer: model.footer,
    buttons,
  };
}
