"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SerializedContactDto } from "@/lib/contacts/dto";

type Props = {
  contacts: SerializedContactDto[];
  readOnly: boolean;
  onEdit: (contact: SerializedContactDto) => void;
  onDelete: (id: string) => void;
};

export function ContactsTable({ contacts, readOnly, onEdit, onDelete }: Props) {
  const t = useTranslations("app.contacts");

  return (
    <>
      {/* Desktop */}
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
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-[13px]">{c.phoneE164}</td>
                  <td className="font-medium text-fg">
                    {c.name ?? <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="text-fg-secondary">{c.email ?? "—"}</td>
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
                          onClick={() => onEdit(c)}
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          className="ds-btn-ghost rounded-lg p-2 text-danger hover:bg-danger-soft"
                          aria-label={t("delete")}
                          onClick={() => onDelete(c.id)}
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

      {/* Mobile */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {contacts.map((c) => (
          <li key={c.id} className="ds-card space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm text-fg">{c.phoneE164}</p>
                <p className="font-medium text-fg">{c.name ?? t("noName")}</p>
                {c.email ? (
                  <p className="text-sm text-fg-secondary">{c.email}</p>
                ) : null}
              </div>
              {!readOnly ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="ds-btn-ghost p-2"
                    onClick={() => onEdit(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="ds-btn-ghost p-2 text-danger"
                    onClick={() => onDelete(c.id)}
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
  );
}
