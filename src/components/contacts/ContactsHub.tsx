"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  BookUser,
  ListPlus,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from "lucide-react";
import {
  ContactFormModal,
  type ContactDto,
  type DefDto,
  type TagDto,
} from "./ContactFormModal";

type ApiPayload = {
  contacts: ContactDto[];
  customFieldDefinitions: DefDto[];
  allTags: TagDto[];
  role: string;
};

function formatDefaultDisplay(d: DefDto, tr: (key: string) => string) {
  const v = d.defaultValue;
  if (v === null || v === undefined) return tr("noDefault");
  if (typeof v === "boolean") return v ? tr("yes") : tr("no");
  return String(v);
}

function FieldDefaultInput({
  fieldType,
  value,
  onChange,
  tr,
}: {
  fieldType: string;
  value: string;
  onChange: (v: string) => void;
  tr: (key: string) => string;
}) {
  if (fieldType === "boolean") {
    return (
      <select
        className="ds-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{tr("emptyOption")}</option>
        <option value="true">{tr("yes")}</option>
        <option value="false">{tr("no")}</option>
      </select>
    );
  }
  if (fieldType === "date") {
    return (
      <input
        type="date"
        className="ds-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (fieldType === "number") {
    return (
      <input
        type="number"
        step="any"
        className="ds-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="ds-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function ContactsHub() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;
  const api = `/api/t/${tenantId}/contacts`;
  const t = useTranslations("app.contacts");
  const [tab, setTab] = useState<"contacts" | "fields">("contacts");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; contact: ContactDto } | null
  >(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [fdLabel, setFdLabel] = useState("");
  const [fdType, setFdType] = useState<string>("text");
  const [fdDefault, setFdDefault] = useState("");
  const [fdErr, setFdErr] = useState<string | null>(null);
  const [fdBusy, setFdBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(api);
    if (!res.ok) return;
    const j = (await res.json()) as ApiPayload;
    setData(j);
    setReadOnly(j.role === "support");
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createField(e: React.FormEvent) {
    e.preventDefault();
    setFdErr(null);
    setFdBusy(true);

    let defaultValue: unknown = null;
    const s = fdDefault.trim();
    if (fdType === "boolean") {
      if (fdDefault === "true") defaultValue = true;
      else if (fdDefault === "false") defaultValue = false;
    } else if (s !== "") {
      if (fdType === "number") {
        defaultValue = Number.parseFloat(s);
      } else if (fdType === "date") {
        defaultValue = s;
      } else {
        defaultValue = s;
      }
    }

    const res = await fetch(`${api}/field-definitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: fdLabel.trim(),
        fieldType: fdType,
        config: null,
        defaultValue,
      }),
    });
    setFdBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setFdErr(j.error ?? t("fieldCreateError"));
      return;
    }
    setFdLabel("");
    setFdDefault("");
    setFdType("text");
    await load();
  }

  async function removeField(id: string) {
    if (!confirm(t("confirmDeleteField"))) return;
    const res = await fetch(`${api}/field-definitions/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    await load();
  }

  async function confirmDeleteContact() {
    if (!deleteId) return;
    setDeleteBusy(true);
    const res = await fetch(`${api}/${deleteId}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) return;
    setDeleteId(null);
    await load();
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-dashed border-border">
        <p className="text-sm text-fg-muted">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: `
              linear-gradient(125deg, rgb(245 158 11 / 0.12) 0%, transparent 42%),
              linear-gradient(300deg, rgb(79 70 229 / 0.06) 0%, transparent 45%)
            `,
          }}
        />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
              <BookUser className="h-7 w-7" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {t("title")}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-fg-secondary">
                {t("subtitle")}
              </p>
              <p className="mt-1 text-sm">
                <Link
                  href={`/${tenantId}/tags`}
                  className="font-medium text-primary-600 underline-offset-2 hover:underline"
                >
                  {t("tagsScreenLink")}
                </Link>
              </p>
            </div>
          </div>
          {!readOnly ? (
            <button
              type="button"
              className="ds-btn-primary shrink-0 gap-2"
              onClick={() => setModal({ mode: "create" })}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {t("newContact")}
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border pb-1">
        <button
          type="button"
          onClick={() => setTab("contacts")}
          className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "contacts"
              ? "bg-card text-fg shadow-sm ring-1 ring-border"
              : "text-fg-secondary hover:text-fg"
          }`}
        >
          {t("tabContacts")}
        </button>
        <button
          type="button"
          onClick={() => setTab("fields")}
          className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "fields"
              ? "bg-card text-fg shadow-sm ring-1 ring-border"
              : "text-fg-secondary hover:text-fg"
          }`}
        >
          <ListPlus className="h-4 w-4" strokeWidth={1.5} />
          {t("tabFields")}
        </button>
      </div>

      {tab === "contacts" ? (
        <>
          <div className="hidden lg:block">
            <div className="ds-table-wrap">
              <table className="ds-table min-w-[800px] w-full">
                <thead>
                  <tr>
                    <th>{t("colPhone")}</th>
                    <th>{t("colName")}</th>
                    <th>{t("colEmail")}</th>
                    <th>{t("colTags")}</th>
                    <th className="text-right">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contacts.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono text-[13px]">{c.phoneE164}</td>
                      <td className="font-medium text-fg">
                        {c.name ?? (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td className="text-fg-secondary">
                        {c.email ?? "—"}
                      </td>
                      <td>
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {c.tags.map((tg) => (
                            <span
                              key={tg.id}
                              className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200/80"
                            >
                              {tg.name}
                            </span>
                          ))}
                          {c.tags.length === 0 ? (
                            <span className="text-fg-muted">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-right">
                        {!readOnly ? (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="ds-btn-ghost rounded-lg p-2"
                              aria-label={t("edit")}
                              onClick={() =>
                                setModal({ mode: "edit", contact: c })
                              }
                            >
                              <Pencil className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              className="ds-btn-ghost rounded-lg p-2 text-danger hover:bg-danger-soft"
                              aria-label={t("delete")}
                              onClick={() => setDeleteId(c.id)}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="flex flex-col gap-3 lg:hidden">
            {data.contacts.map((c) => (
              <li key={c.id} className="ds-card space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm text-fg">{c.phoneE164}</p>
                    <p className="font-medium text-fg">
                      {c.name ?? t("noName")}
                    </p>
                    {c.email ? (
                      <p className="text-sm text-fg-secondary">{c.email}</p>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="ds-btn-ghost p-2"
                        onClick={() => setModal({ mode: "edit", contact: c })}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="ds-btn-ghost p-2 text-danger"
                        onClick={() => setDeleteId(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.tags.map((tg) => (
                    <span
                      key={tg.id}
                      className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-200"
                    >
                      {tg.name}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-8">
          <section className="ds-card overflow-hidden">
            <div className="border-b border-border bg-neutral-50/80 px-5 py-4">
              <div className="flex items-center gap-2">
                <Tags className="h-5 w-5 text-primary-600" strokeWidth={1.5} />
                <h2 className="font-display text-lg font-semibold text-fg">
                  {t("systemFieldsTitle")}
                </h2>
              </div>
              <p className="mt-2 text-sm text-fg-secondary">
                {t("systemFieldsBody")}
              </p>
            </div>
            <div className="divide-y divide-border">
              {data.customFieldDefinitions.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-fg-muted">
                  {t("noCustomFields")}
                </p>
              ) : (
                data.customFieldDefinitions.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-fg">{d.label}</p>
                      <p className="text-xs text-fg-muted">
                        {d.key} · {d.fieldType}
                      </p>
                      <p className="mt-1 text-xs text-fg-secondary">
                        {t("fieldDefaultShort")}:{" "}
                        <span className="font-medium text-fg">
                          {formatDefaultDisplay(d, t)}
                        </span>
                      </p>
                    </div>
                    {!readOnly ? (
                      <button
                        type="button"
                        className="ds-btn-ghost self-start text-danger sm:self-center"
                        onClick={() => void removeField(d.id)}
                      >
                        {t("removeField")}
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {!readOnly ? (
              <form
                onSubmit={(e) => void createField(e)}
                className="space-y-4 border-t border-border bg-neutral-50/40 p-5 sm:p-6"
              >
                <p className="text-sm font-semibold text-fg">{t("addFieldTitle")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="ds-label">
                    {t("fieldLabel")}
                    <input
                      className="ds-input"
                      value={fdLabel}
                      onChange={(e) => setFdLabel(e.target.value)}
                      required
                    />
                  </label>
                  <label className="ds-label">
                    {t("fieldType")}
                    <select
                      className="ds-select"
                      value={fdType}
                      onChange={(e) => {
                        setFdType(e.target.value);
                        setFdDefault("");
                      }}
                    >
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                    </select>
                  </label>
                </div>
                <label className="ds-label">
                  {t("fieldDefaultLabel")}
                  <FieldDefaultInput
                    fieldType={fdType}
                    value={fdDefault}
                    onChange={setFdDefault}
                    tr={t}
                  />
                  <span className="mt-1 block text-xs text-fg-muted">
                    {t("fieldDefaultHint")}
                  </span>
                </label>
                {fdErr ? (
                  <p className="text-sm text-danger">{fdErr}</p>
                ) : null}
                <button
                  type="submit"
                  className="ds-btn-primary"
                  disabled={fdBusy}
                >
                  {fdBusy ? t("saving") : t("addField")}
                </button>
              </form>
            ) : null}
          </section>
        </div>
      )}

      <ContactFormModal
        tenantId={tenantId}
        open={modal !== null}
        mode={modal?.mode ?? "create"}
        contact={modal?.mode === "edit" ? modal.contact : null}
        allTags={data?.allTags ?? []}
        definitions={data?.customFieldDefinitions ?? []}
        readOnly={readOnly}
        onClose={() => setModal(null)}
        onSaved={() => void load()}
        onTagCreated={(tg) =>
          setData((d) =>
            d
              ? {
                  ...d,
                  allTags: d.allTags.some((x) => x.id === tg.id)
                    ? d.allTags
                    : [...d.allTags, tg].sort((a, b) =>
                        a.name.localeCompare(b.name),
                      ),
                }
              : d,
          )
        }
      />

      {deleteId ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-fg/30 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !deleteBusy && setDeleteId(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-semibold text-fg">
              {t("deleteContactTitle")}
            </p>
            <p className="mt-2 text-sm text-fg-secondary">
              {t("deleteContactBody")}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="ds-btn-outline"
                disabled={deleteBusy}
                onClick={() => setDeleteId(null)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-white hover:bg-red-600"
                disabled={deleteBusy}
                onClick={() => void confirmDeleteContact()}
              >
                {deleteBusy ? t("deleting") : t("deleteConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
