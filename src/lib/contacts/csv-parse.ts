/**
 * Parser CSV leve (estilo RFC 4180) para importação.
 * Campos entre aspas duplas; aspas duplicadas escapam como "".
 */

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Divide em linhas sem quebrar dentro de aspas. */
function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        cur += c;
      }
    } else if (!inQuotes && (c === "\n" || (c === "\r" && text[i + 1] === "\n"))) {
      if (c === "\r") i++;
      if (cur.length > 0 || rows.length === 0) {
        rows.push(cur);
        cur = "";
      }
    } else if (!inQuotes && c === "\r") {
      rows.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || rows.length === 0) rows.push(cur);
  return rows.filter((r) => r.trim().length > 0);
}

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

export function parseCsv(text: string): ParsedCsv {
  const raw = text.replace(/^\uFEFF/, "").trim();
  if (!raw) return { headers: [], rows: [] };

  const lines = splitCsvRows(raw);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);
  if (headers.length === 0 || headers.every((h) => !h)) {
    return { headers: [], rows: [] };
  }

  const rows: string[][] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    if (cells.every((c) => !c.trim())) continue;
    const normalized =
      cells.length < headers.length
        ? [...cells, ...Array(headers.length - cells.length).fill("")]
        : cells.slice(0, headers.length);
    rows.push(normalized);
  }

  return { headers, rows };
}

/** Heurística ManyChat: normaliza header para sugerir mapeamento. */
export function guessSystemMappingFromHeader(
  header: string,
): "name" | "phone" | "email" | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, " ");
  if (
    h === "name" ||
    h === "nome" ||
    h === "full name" ||
    h === "nome completo"
  ) {
    return "name";
  }
  if (
    h === "phone" ||
    h === "telefone" ||
    h === "celular" ||
    h === "mobile" ||
    h === "whatsapp" ||
    h === "wa" ||
    h === "phone number"
  ) {
    return "phone";
  }
  if (
    h === "email" ||
    h === "e-mail" ||
    h === "e mail" ||
    h === "mail"
  ) {
    return "email";
  }
  return null;
}
