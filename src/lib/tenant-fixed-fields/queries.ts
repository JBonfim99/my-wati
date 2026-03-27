import { and, asc, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import {
  contactCustomFieldDefinitions,
  tenantFixedFields,
} from "@/lib/db/schema";
import { slugify } from "@/lib/contacts/slug";
import { isValidNamedTemplatePlaceholderName } from "@/lib/meta/template-create-payload";
import { STANDARD_CONTACT_TEMPLATE_PLACEHOLDERS } from "@/lib/templates/contact-template-variables";

export type TenantFixedFieldDto = {
  id: string;
  key: string;
  label: string;
  value: string;
  sortOrder: number;
  updatedAt: string;
};

const VALUE_MAX = 4096;
const LABEL_MAX = 200;
const KEY_MAX = 64;

export function normalizeTenantFixedFieldKey(raw: string): string {
  return raw.trim().toLowerCase();
}

export function suggestTenantFixedKeyFromLabel(label: string): string {
  const base = slugify(label).replace(/-/g, "_").replace(/[^a-z0-9_]/g, "");
  if (isValidNamedTemplatePlaceholderName(base)) return base.slice(0, KEY_MAX);
  const trimmed = base.replace(/^[0-9_]+/, "");
  if (isValidNamedTemplatePlaceholderName(trimmed)) return trimmed.slice(0, KEY_MAX);
  return `org_${Date.now().toString(36)}`.slice(0, KEY_MAX);
}

async function listContactCustomKeys(
  db: AppDb,
  tenantId: number,
): Promise<Set<string>> {
  const rows = await db
    .select({ key: contactCustomFieldDefinitions.key })
    .from(contactCustomFieldDefinitions)
    .where(eq(contactCustomFieldDefinitions.tenantId, tenantId));
  return new Set(rows.map((r) => r.key.trim().toLowerCase()).filter(Boolean));
}

/** Erro em português ou null se a chave pode ser usada. */
export async function validateNewTenantFixedFieldKey(
  db: AppDb,
  tenantId: number,
  keyRaw: string,
): Promise<string | null> {
  const key = normalizeTenantFixedFieldKey(keyRaw);
  if (!key) return "Informe uma chave.";
  if (key.length > KEY_MAX) return "Chave muito longa.";
  if (!isValidNamedTemplatePlaceholderName(key)) {
    return "Chave inválida: use letra minúscula inicial, depois a-z, 0-9 e _.";
  }
  const std = new Set(
    STANDARD_CONTACT_TEMPLATE_PLACEHOLDERS as unknown as string[],
  );
  if (std.has(key)) {
    return "Esta chave é reservada aos dados do contato (nome, e-mail, telefone).";
  }
  const contactKeys = await listContactCustomKeys(db, tenantId);
  if (contactKeys.has(key)) {
    return "Já existe um campo personalizado de contato com esta chave.";
  }

  const [taken] = await db
    .select({ id: tenantFixedFields.id })
    .from(tenantFixedFields)
    .where(
      and(eq(tenantFixedFields.tenantId, tenantId), eq(tenantFixedFields.key, key)),
    )
    .limit(1);

  if (taken) {
    return "Já existe um campo fixo da organização com esta chave.";
  }
  return null;
}

/**
 * Gera uma chave única (tenta `requested` ou sugere a partir do rótulo, com sufixo _2, _3…).
 */
export async function allocateTenantFixedFieldKey(
  db: AppDb,
  tenantId: number,
  label: string,
  requested?: string,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const baseRaw = requested?.trim()
    ? normalizeTenantFixedFieldKey(requested)
    : suggestTenantFixedKeyFromLabel(label);
  if (!isValidNamedTemplatePlaceholderName(baseRaw)) {
    return {
      ok: false,
      error:
        "Chave inválida: use letra minúscula inicial, depois a-z, 0-9 e _ (ex.: codigo_promo).",
    };
  }
  const base = baseRaw.slice(0, KEY_MAX);
  for (let i = 0; i < 80; i++) {
    const cand =
      i === 0 ? base : `${base}_${i}`.slice(0, KEY_MAX);
    const err = await validateNewTenantFixedFieldKey(db, tenantId, cand);
    if (!err) return { ok: true, key: cand };
  }
  return { ok: false, error: "Não foi possível gerar uma chave única." };
}

export async function listTenantFixedFields(
  db: AppDb,
  tenantId: number,
): Promise<TenantFixedFieldDto[]> {
  const rows = await db
    .select()
    .from(tenantFixedFields)
    .where(eq(tenantFixedFields.tenantId, tenantId))
    .orderBy(asc(tenantFixedFields.sortOrder), asc(tenantFixedFields.label));

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    value: r.value,
    sortOrder: r.sortOrder,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createTenantFixedField(
  db: AppDb,
  tenantId: number,
  input: { key: string; label: string; value: string },
): Promise<{ ok: true; item: TenantFixedFieldDto } | { ok: false; error: string }> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Informe o rótulo." };
  if (label.length > LABEL_MAX) return { ok: false, error: "Rótulo muito longo." };

  const value = input.value.length > VALUE_MAX ? input.value.slice(0, VALUE_MAX) : input.value;

  const key = normalizeTenantFixedFieldKey(input.key);
  const keyErr = await validateNewTenantFixedFieldKey(db, tenantId, key);
  if (keyErr) return { ok: false, error: keyErr };

  const [row] = await db
    .insert(tenantFixedFields)
    .values({
      tenantId,
      key,
      label,
      value,
    })
    .returning();

  if (!row) return { ok: false, error: "Não foi possível criar o campo." };

  return {
    ok: true,
    item: {
      id: row.id,
      key: row.key,
      label: row.label,
      value: row.value,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

export async function updateTenantFixedField(
  db: AppDb,
  tenantId: number,
  id: string,
  patch: { label?: string; value?: string; sortOrder?: number },
): Promise<{ ok: true; item: TenantFixedFieldDto } | { ok: false; error: string }> {
  const [existing] = await db
    .select()
    .from(tenantFixedFields)
    .where(
      and(eq(tenantFixedFields.id, id), eq(tenantFixedFields.tenantId, tenantId)),
    )
    .limit(1);

  if (!existing) return { ok: false, error: "Campo não encontrado." };

  const nextLabel =
    patch.label !== undefined ? patch.label.trim() : existing.label;
  if (!nextLabel) return { ok: false, error: "Informe o rótulo." };
  if (nextLabel.length > LABEL_MAX) return { ok: false, error: "Rótulo muito longo." };

  let nextValue = existing.value;
  if (patch.value !== undefined) {
    nextValue =
      patch.value.length > VALUE_MAX
        ? patch.value.slice(0, VALUE_MAX)
        : patch.value;
  }

  const nextSort =
    patch.sortOrder !== undefined
      ? Math.max(0, Math.floor(patch.sortOrder))
      : existing.sortOrder;

  const [row] = await db
    .update(tenantFixedFields)
    .set({
      label: nextLabel,
      value: nextValue,
      sortOrder: nextSort,
      updatedAt: new Date(),
    })
    .where(
      and(eq(tenantFixedFields.id, id), eq(tenantFixedFields.tenantId, tenantId)),
    )
    .returning();

  if (!row) return { ok: false, error: "Não foi possível atualizar." };

  return {
    ok: true,
    item: {
      id: row.id,
      key: row.key,
      label: row.label,
      value: row.value,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

export async function deleteTenantFixedField(
  db: AppDb,
  tenantId: number,
  id: string,
): Promise<boolean> {
  const res = await db
    .delete(tenantFixedFields)
    .where(
      and(eq(tenantFixedFields.id, id), eq(tenantFixedFields.tenantId, tenantId)),
    )
    .returning({ id: tenantFixedFields.id });
  return res.length > 0;
}

export { VALUE_MAX as TENANT_FIXED_VALUE_MAX, LABEL_MAX as TENANT_FIXED_LABEL_MAX };
