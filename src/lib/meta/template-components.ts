/**
 * Sanitiza `components` retornados pela listagem/GET da Meta para POST create/update.
 * Remove campos somente leitura e mantém o mínimo exigido pela API.
 */

type JsonObj = Record<string, unknown>;

function isObj(v: unknown): v is JsonObj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function sanitizeExample(ex: unknown): unknown {
  if (!isObj(ex)) return ex;
  const out: JsonObj = {};
  for (const k of [
    "header_text",
    "body_text",
    "header_handle",
    "header_text_named_params",
    "body_text_named_params",
  ] as const) {
    if (k in ex) out[k] = ex[k];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeButton(btn: unknown): JsonObj | null {
  if (!isObj(btn)) return null;
  const type = typeof btn.type === "string" ? btn.type : "";
  if (!type) return null;
  const out: JsonObj = { type };
  if (typeof btn.text === "string") out.text = btn.text;
  if (typeof btn.phone_number === "string")
    out.phone_number = btn.phone_number;
  if (btn.url !== undefined) {
    if (typeof btn.url === "string") {
      out.url = btn.url;
    } else if (isObj(btn.url)) {
      const u = btn.url;
      const baseUrl =
        typeof u.base_url === "string" ? u.base_url : undefined;
      const suffix =
        typeof u.url_suffix_example === "string"
          ? u.url_suffix_example
          : undefined;
      if (baseUrl) {
        out.url = {
          base_url: baseUrl,
          ...(suffix ? { url_suffix_example: suffix } : {}),
        };
      }
    }
  }
  if (typeof btn.example === "string") out.example = btn.example;
  return out;
}

function sanitizeButtonsComponent(comp: JsonObj): JsonObj | null {
  const raw = comp.buttons;
  if (!Array.isArray(raw)) return null;
  const buttons = raw
    .map(sanitizeButton)
    .filter((b): b is JsonObj => b !== null);
  if (buttons.length === 0) return null;
  return { type: "BUTTONS", buttons };
}

/**
 * Componente pronto para create/update na Meta (texto + botões comuns).
 * Headers só TEXT são suportados na duplicação/edição mínima.
 */
export function sanitizeTemplateComponentForWrite(
  comp: unknown,
): unknown | null {
  if (!isObj(comp)) return null;
  const type = typeof comp.type === "string" ? comp.type.toUpperCase() : "";
  if (!type) return null;

  if (type === "BODY") {
    const text = typeof comp.text === "string" ? comp.text : "";
    if (!text) return null;
    const ex = sanitizeExample(comp.example);
    return ex !== undefined
      ? { type: "BODY", text, example: ex }
      : { type: "BODY", text };
  }

  if (type === "FOOTER") {
    const text = typeof comp.text === "string" ? comp.text : "";
    if (!text) return null;
    return { type: "FOOTER", text };
  }

  if (type === "HEADER") {
    const format =
      typeof comp.format === "string" ? comp.format.toUpperCase() : "TEXT";
    if (format !== "TEXT") return null;
    const text = typeof comp.text === "string" ? comp.text : "";
    if (!text) return null;
    const ex = sanitizeExample(comp.example);
    const base: JsonObj = { type: "HEADER", format: "TEXT", text };
    if (ex !== undefined) base.example = ex;
    return base;
  }

  if (type === "BUTTONS") {
    return sanitizeButtonsComponent(comp);
  }

  return null;
}

export function sanitizeTemplateComponentsForWrite(
  components: unknown,
): unknown[] {
  if (!Array.isArray(components)) return [];
  const out: unknown[] = [];
  for (const c of components) {
    const s = sanitizeTemplateComponentForWrite(c);
    if (s !== null) out.push(s);
  }
  return out;
}

/** Categorias aceitas no POST; mapeia legado TRANSACTIONAL → UTILITY. */
export function normalizeTemplateCategoryForWrite(
  raw: string | undefined,
): "UTILITY" | "MARKETING" | "AUTHENTICATION" {
  const u = (raw ?? "").toUpperCase();
  if (u === "MARKETING") return "MARKETING";
  if (u === "AUTHENTICATION") return "AUTHENTICATION";
  if (u === "UTILITY" || u === "TRANSACTIONAL") return "UTILITY";
  return "UTILITY";
}

/** Nome de template Meta: minúsculas, números e underscore. */
export function slugifyTemplateName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 512);
}

export function suggestDuplicateTemplateName(baseName: string): string {
  const slug = slugifyTemplateName(baseName) || "template";
  const suffix = `_copy_${Date.now()}`;
  const max = 512;
  if (slug.length + suffix.length <= max) return `${slug}${suffix}`;
  return `${slug.slice(0, max - suffix.length)}${suffix}`;
}
