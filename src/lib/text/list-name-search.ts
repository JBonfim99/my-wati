/**
 * Busca em nomes de lista: ignora acentos, várias palavras (todas devem casar),
 * prioriza início de palavra e aceita abreviações por subsequência de caracteres.
 */

export function normalizeForListSearch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function queryTokens(raw: string): string[] {
  return normalizeForListSearch(raw)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function wordsFromNormalizedName(normName: string): string[] {
  return normName.split(/[^a-z0-9]+/).filter((w) => w.length > 0);
}

/** Cada caractere de needle aparece em ordem em hay (ex.: "lds" em "leads"). */
function subsequenceMatch(hay: string, needle: string): boolean {
  if (needle.length === 0) return true;
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) {
      i++;
      if (i === needle.length) return true;
    }
  }
  return false;
}

function scoreTokenAgainstName(
  norm: string,
  words: string[],
  t: string,
): number {
  if (t.length === 0) return 1;
  if (norm === t) return 1000;
  if (norm.startsWith(t)) return 500;
  for (const w of words) {
    if (w === t) return 200;
    if (w.startsWith(t)) return 150;
    if (w.includes(t)) return 80;
  }
  if (norm.includes(t)) return 40;
  if (t.length >= 2 && subsequenceMatch(norm, t)) return 15;
  return 0;
}

/**
 * Filtra itens pelo texto de busca e ordena por relevância (maior primeiro), depois nome.
 * Com query vazia, devolve todos os itens ordenados só por nome.
 */
export function filterListsBySearch<T extends { name: string }>(
  items: T[],
  query: string,
): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
    );
  }

  type Meta = { item: T; score: number };
  const out: Meta[] = [];
  for (const item of items) {
    const norm = normalizeForListSearch(item.name);
    const words = wordsFromNormalizedName(norm);
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const s = scoreTokenAgainstName(norm, words, t);
      if (s <= 0) {
        ok = false;
        break;
      }
      total += s;
    }
    if (ok) out.push({ item, score: total });
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.name.localeCompare(b.item.name, "pt-BR", {
      sensitivity: "base",
    });
  });
  return out.map((m) => m.item);
}
