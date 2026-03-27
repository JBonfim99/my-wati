import { sanitizeTemplateComponentsForWrite } from "@/lib/meta/template-components";

type Btn = { type: string; text: string; url?: string };

function compType(c: unknown): string {
  if (!c || typeof c !== "object" || !("type" in c)) return "";
  return String((c as { type: string }).type).toUpperCase();
}

export function templateHasUnsupportedEditTypes(components: unknown): boolean {
  if (!Array.isArray(components)) return true;
  for (const c of components) {
    const t = compType(c);
    if (
      t === "CAROUSEL" ||
      t === "LIMITED_TIME_OFFER" ||
      t === "ALBUM" ||
      t === "CALL_PERMISSION_REQUEST"
    ) {
      return true;
    }
    if (t === "HEADER") {
      const fmt = String((c as { format?: string }).format ?? "").toUpperCase();
      if (
        fmt === "IMAGE" ||
        fmt === "VIDEO" ||
        fmt === "DOCUMENT" ||
        fmt === "LOCATION"
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Cabeçalho em texto (ignora mídia). */
export function extractHeaderTextForPreview(components: unknown): string {
  if (!Array.isArray(components)) return "";
  for (const c of components) {
    const t = compType(c);
    if (t !== "HEADER") continue;
    const fmt = String((c as { format?: string }).format ?? "TEXT").toUpperCase();
    if (fmt !== "TEXT" && fmt !== "") continue;
    const tx = (c as { text?: string }).text;
    return typeof tx === "string" ? tx : "";
  }
  return "";
}

export function extractEditableTemplateFields(components: unknown): {
  body: string;
  footer: string;
  buttons: Btn[];
} {
  if (!Array.isArray(components)) {
    return { body: "", footer: "", buttons: [] };
  }
  let b = "";
  let f = "";
  const buttons: Btn[] = [];
  for (const c of components) {
    const t = compType(c);
    if (t === "BODY" && typeof (c as { text?: string }).text === "string") {
      b = (c as { text: string }).text;
    }
    if (t === "FOOTER" && typeof (c as { text?: string }).text === "string") {
      f = (c as { text: string }).text;
    }
    if (t === "BUTTONS") {
      const raw = (c as { buttons?: unknown[] }).buttons;
      if (Array.isArray(raw)) {
        for (const btn of raw) {
          if (!btn || typeof btn !== "object") continue;
          const bt = String((btn as { type?: string }).type ?? "")
            .toUpperCase()
            .trim();
          const text = String((btn as { text?: string }).text ?? "").trim();
          if (!text) continue;
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
            buttons.push({ type: "URL", text, url });
          } else if (bt === "QUICK_REPLY") {
            buttons.push({ type: "QUICK_REPLY", text });
          }
        }
      }
    }
  }
  return { body: b, footer: f, buttons };
}

/**
 * Monta array de components para PATCH preservando HEADER (texto) e substituindo corpo/rodapé/botões.
 */
export function buildTemplateComponentsForPatch(
  originalComponents: unknown,
  opts: { body: string; footer: string; buttons: Btn[] },
): unknown[] {
  const sanitized = sanitizeTemplateComponentsForWrite(originalComponents);
  const headers = sanitized.filter((c) => compType(c) === "HEADER");
  const bodyText = opts.body.trim();
  const bodyComp = bodyText ? [{ type: "BODY", text: bodyText }] : [];
  const footerText = opts.footer.trim();
  const footerComp = footerText ? [{ type: "FOOTER", text: footerText }] : [];

  const builtButtons: unknown[] = [];
  for (const b of opts.buttons) {
    const text = b.text.trim();
    if (!text) continue;
    const t = b.type.toUpperCase();
    if (t === "URL") {
      const url = (b.url ?? "").trim() || "https://example.com";
      builtButtons.push({ type: "URL", text, url });
    } else if (t === "QUICK_REPLY") {
      builtButtons.push({ type: "QUICK_REPLY", text });
    }
  }
  const buttonsComp =
    builtButtons.length > 0
      ? [{ type: "BUTTONS", buttons: builtButtons }]
      : [];

  if (bodyComp.length === 0) {
    return [...headers, ...footerComp, ...buttonsComp];
  }
  return [...headers, ...bodyComp, ...footerComp, ...buttonsComp];
}
