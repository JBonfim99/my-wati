/**
 * Cotação USD→BRL (ECB via Frankfurter). Cache em memória ~1h.
 */

const CACHE_TTL_MS = 3_600_000;
let cache: { rate: number; fetchedAt: number } | null = null;

export type UsdBrlResult =
  | { ok: true; rate: number; asOf: string }
  | { ok: false; error: string };

export async function getUsdBrlRate(): Promise<UsdBrlResult> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      ok: true,
      rate: cache.rate,
      asOf: new Date(cache.fetchedAt).toISOString(),
    };
  }

  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=BRL",
    );
    if (!res.ok) {
      return { ok: false, error: `FX HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      rates?: { BRL?: number };
      date?: string;
    };
    const brl = json.rates?.BRL;
    if (typeof brl !== "number" || !Number.isFinite(brl) || brl <= 0) {
      return { ok: false, error: "Resposta FX inválida" };
    }
    cache = { rate: brl, fetchedAt: now };
    return {
      ok: true,
      rate: brl,
      asOf: json.date ?? new Date(now).toISOString(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro de rede FX";
    return { ok: false, error: msg };
  }
}
