"use client";

import { useEffect, useMemo, useState } from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { useTranslations } from "next-intl";
import {
  Check,
  Copy,
  Mail,
  MessageCircle,
  User,
  X,
} from "lucide-react";
import type { SerializedContactDto } from "@/lib/contacts/dto";
import { ContactTagsSection } from "./ContactTagsSection";

export type TagDto = { id: number; name: string; slug: string };
export type ContactListOptDto = { id: number; name: string };
export type DefDto = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  config: { options?: { value: string; label: string }[] } | null;
  defaultValue?: unknown;
};

/** @deprecated Use SerializedContactDto from @/lib/contacts/dto */
export type ContactDto = SerializedContactDto;

function valueToFormString(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) return "";
  if (fieldType === "boolean") {
    if (value === true) return "true";
    if (value === false) return "false";
    return "";
  }
  return String(value);
}

function digitsForWa(phone: string): string {
  return phone.replace(/\D/g, "");
}

type Props = {
  tenantId: string;
  open: boolean;
  mode: "create" | "edit";
  contact: SerializedContactDto | null;
  allTags: TagDto[];
  /** Listas da organização (para marcar participação). */
  allLists?: ContactListOptDto[];
  definitions: DefDto[];
  readOnly: boolean;
  onClose: () => void;
  onSaved: (contact: SerializedContactDto) => void;
  /** Quando uma tag é criada pelo seletor (+ Tag), mescla na lista global da página. */
  onTagCreated?: (tag: TagDto) => void;
};

export function ContactFormModal({
  tenantId,
  open,
  mode,
  contact,
  allTags,
  allLists = [],
  definitions,
  readOnly,
  onClose,
  onSaved,
  onTagCreated,
}: Props) {
  const t = useTranslations("app.contacts");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedContactId, setCopiedContactId] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState<Set<number>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setCopiedContactId(false);
    if (mode === "edit" && contact) {
      setPhone(contact.phoneE164);
      setName(contact.name ?? "");
      setEmail(contact.email ?? "");
      setSelectedTagIds(new Set(contact.tags.map((x) => x.id)));
      const c: Record<string, string> = {};
      for (const d of definitions) {
        let effective: unknown;
        if (d.id in contact.customValues) {
          effective = contact.customValues[d.id];
        } else {
          effective = d.defaultValue ?? null;
        }
        c[d.id] = valueToFormString(effective, d.fieldType);
      }
      setCustom(c);
    } else {
      setPhone("");
      setName("");
      setEmail("");
      setSelectedTagIds(new Set());
      setSelectedListIds(new Set());
      const c: Record<string, string> = {};
      for (const d of definitions) {
        c[d.id] = valueToFormString(d.defaultValue ?? null, d.fieldType);
      }
      setCustom(c);
    }
  }, [open, mode, contact, definitions]);

  useEffect(() => {
    if (!open || mode !== "edit" || !contact) {
      if (open && mode === "create") setSelectedListIds(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/t/${tenantId}/contacts/${contact.id}`);
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as {
        contactLists?: { id: number; name: string }[];
      };
      setSelectedListIds(
        new Set((j.contactLists ?? []).map((x) => x.id)),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contact?.id é estável; evita refetch ao mudar só a referência do objeto
  }, [open, mode, contact?.id, tenantId]);

  const sortedDefs = useMemo(
    () => [...definitions].sort((a, b) => a.label.localeCompare(b.label)),
    [definitions],
  );

  const waDigits = digitsForWa(phone);
  const waHref =
    waDigits.length > 0 ? `https://wa.me/${waDigits}` : undefined;

  async function copyContactId(id: string | number) {
    try {
      await navigator.clipboard.writeText(String(id));
      setCopiedContactId(true);
      window.setTimeout(() => setCopiedContactId(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function handleTagCreated(tag: TagDto) {
    onTagCreated?.(tag);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setErr(null);
    setSaving(true);
    const customValues: Record<string, unknown> = {};
    for (const d of definitions) {
      const raw = custom[d.id]?.trim() ?? "";
      if (raw === "") {
        customValues[d.id] = null;
      } else if (d.fieldType === "boolean") {
        customValues[d.id] = raw === "true";
      } else if (d.fieldType === "number") {
        customValues[d.id] = Number.parseFloat(raw);
      } else {
        customValues[d.id] = raw;
      }
    }

    const payload = {
      phone,
      name: name || null,
      email: email || null,
      tagIds: [...selectedTagIds],
      listIds: [...selectedListIds],
      customValues,
    };

    const base = `/api/t/${tenantId}/contacts`;
    const url = mode === "create" ? base : `${base}/${contact!.id}`;
    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setErr(j.error ?? t("saveError"));
      return;
    }
    const j = (await res.json()) as { contact: SerializedContactDto };
    onSaved(j.contact);
    onClose();
  }

  const systemFields = (
    <>
      <label className="ds-label">
        {t("systemPhone")} *
        <PhoneInput
          international
          defaultCountry="BR"
          value={phone || undefined}
          onChange={(v) => setPhone(v ?? "")}
          disabled={readOnly}
          limitMaxLength
          className="phone-input-ds"
          numberInputProps={{
            required: true,
            name: "contact-phone",
          }}
        />
      </label>
      <label className="ds-label">
        {t("systemName")}
        <input
          className="ds-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
        />
      </label>
      <label className="ds-label">
        {t("systemEmail")}
        <input
          type="email"
          className="ds-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={readOnly}
        />
      </label>
    </>
  );

  const customFieldsBlock =
    sortedDefs.length > 0 ? (
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("systemCustomFieldsSection")}
        </p>
        {sortedDefs.map((d) => (
          <div key={d.id}>
            <label className="ds-label">
              {d.label}
              <span className="ml-1 text-fg-muted">({d.fieldType})</span>
            </label>
            {d.fieldType === "boolean" ? (
              <select
                className="ds-select !mt-1.5"
                value={custom[d.id] ?? ""}
                onChange={(e) =>
                  setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                }
                disabled={readOnly}
              >
                <option value="">{t("emptyOption")}</option>
                <option value="true">{t("yes")}</option>
                <option value="false">{t("no")}</option>
              </select>
            ) : d.fieldType === "select" ? (
              <select
                className="ds-select !mt-1.5"
                value={custom[d.id] ?? ""}
                onChange={(e) =>
                  setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                }
                disabled={readOnly}
              >
                <option value="">{t("emptyOption")}</option>
                {(d.config?.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : d.fieldType === "date" ? (
              <input
                type="date"
                className="ds-input !mt-1.5"
                value={custom[d.id] ?? ""}
                onChange={(e) =>
                  setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                }
                disabled={readOnly}
              />
            ) : d.fieldType === "number" ? (
              <input
                type="number"
                step="any"
                className="ds-input !mt-1.5"
                value={custom[d.id] ?? ""}
                onChange={(e) =>
                  setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                }
                disabled={readOnly}
              />
            ) : (
              <input
                className="ds-input !mt-1.5"
                value={custom[d.id] ?? ""}
                onChange={(e) =>
                  setCustom((s) => ({ ...s, [d.id]: e.target.value }))
                }
                disabled={readOnly}
              />
            )}
          </div>
        ))}
      </div>
    ) : null;

  const tagsBlock = (
    <ContactTagsSection
      tenantId={tenantId}
      allTags={allTags}
      selectedTagIds={selectedTagIds}
      onSelectionChange={setSelectedTagIds}
      onTagCreated={handleTagCreated}
      readOnly={readOnly}
    />
  );

  const listsBlock =
    allLists.length > 0 ? (
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("contactListsSection")}
        </p>
        <ul className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-border bg-neutral-50/50 p-3">
          {allLists.map((l) => (
            <li key={l.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`contact-list-${l.id}`}
                className="h-4 w-4 rounded border-border text-primary-600"
                checked={selectedListIds.has(l.id)}
                onChange={(e) => {
                  setSelectedListIds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(l.id);
                    else next.delete(l.id);
                    return next;
                  });
                }}
                disabled={readOnly}
              />
              <label
                htmlFor={`contact-list-${l.id}`}
                className="min-w-0 flex-1 cursor-pointer text-sm text-fg"
              >
                {l.name}
              </label>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("contactListsSection")}
        </p>
        <p className="mt-2 text-sm text-fg-muted">{t("contactListsEmptyHint")}</p>
      </div>
    );

  if (!open) return null;

  const isEditLayout = mode === "edit" && contact;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-fg/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-form-title"
      onClick={() => !saving && onClose()}
    >
      <div
        className={`flex max-h-[min(100dvh,800px)] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[min(92vh,880px)] sm:rounded-2xl ${
          isEditLayout ? "max-w-4xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <h2
            id="contact-form-title"
            className="font-display text-lg font-semibold text-fg"
          >
            {mode === "create" ? t("newContact") : t("contactDetailTitle")}
          </h2>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-2 text-fg-muted hover:bg-neutral-100 hover:text-fg"
            aria-label={t("close")}
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <form
          onSubmit={(e) => void submit(e)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {isEditLayout ? (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <aside className="shrink-0 border-b border-border bg-gradient-to-b from-primary-50/80 to-primary-50/30 p-5 lg:w-72 lg:border-b-0 lg:border-r lg:border-border">
                <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
                  <User className="h-12 w-12" strokeWidth={1.25} aria-hidden />
                </div>
                <ul className="space-y-4 text-sm">
                  <li className="flex gap-3">
                    <MessageCircle
                      className="mt-0.5 h-5 w-5 shrink-0 text-primary-600"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                        {t("contactSidebarPhone")}
                      </p>
                      <p className="font-mono text-fg">{phone || "—"}</p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <Mail
                      className="mt-0.5 h-5 w-5 shrink-0 text-primary-600"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                        {t("contactSidebarEmail")}
                      </p>
                      <p className="break-all text-fg">
                        {email.trim() ? email : "—"}
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                      <span className="text-[10px] font-bold text-primary-600">
                        ID
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                        {t("contactSidebarContactId")}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <p
                          className="truncate font-mono text-xs text-fg-secondary"
                          title={String(contact.id)}
                        >
                          {contact.id}
                        </p>
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 text-fg-muted hover:bg-primary-100/80 hover:text-fg"
                          aria-label={t("contactCopyIdAria")}
                          title={
                            copiedContactId
                              ? t("contactIdCopied")
                              : t("contactCopyId")
                          }
                          onClick={() => void copyContactId(contact.id)}
                        >
                          {copiedContactId ? (
                            <Check
                              className="h-4 w-4 text-emerald-600"
                              strokeWidth={2}
                            />
                          ) : (
                            <Copy className="h-4 w-4" strokeWidth={1.5} />
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                </ul>
                {waHref ? (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ds-btn-primary mt-6 flex w-full items-center justify-center"
                  >
                    {t("contactStartChat")}
                  </a>
                ) : (
                  <p className="mt-6 text-center text-xs text-fg-muted">
                    {t("contactStartChatDisabled")}
                  </p>
                )}
              </aside>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-border px-5 py-3 sm:px-6">
                  <p className="font-display text-xl font-bold tracking-tight text-fg">
                    {name.trim() || t("noName")}
                  </p>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                  {tagsBlock}
                  {listsBlock}
                  <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-fg-secondary">
                    {t("contactBaseHint")}
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    {t("contactSystemFields")}
                  </p>
                  {systemFields}
                  {customFieldsBlock}
                  {err ? (
                    <p className="text-sm text-danger" role="alert">
                      {err}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-fg-secondary">
                {t("contactBaseHint")}
              </div>
              {systemFields}
              {tagsBlock}
              {listsBlock}
              {customFieldsBlock}
              {err ? (
                <p className="text-sm text-danger" role="alert">
                  {err}
                </p>
              ) : null}
            </div>
          )}

          {!readOnly ? (
            <div className="flex shrink-0 gap-2 border-t border-border bg-neutral-50/80 px-5 py-4 sm:px-6">
              <button
                type="button"
                className="ds-btn-outline flex-1"
                onClick={onClose}
                disabled={saving}
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="ds-btn-primary flex-1"
                disabled={saving}
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
