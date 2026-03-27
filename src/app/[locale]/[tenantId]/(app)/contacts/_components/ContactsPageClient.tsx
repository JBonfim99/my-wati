"use client";

import { useState } from "react";
import { BookUser, ListPlus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { SerializedContactDto } from "@/lib/contacts/dto";
import type {
  ContactCustomFieldDefDto,
  ContactTagDto,
} from "@/lib/contacts/queries";
import { ContactsTable } from "./ContactsTable";
import { FieldDefinitionsPanel } from "./FieldDefinitionsPanel";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import {
  ContactFormModal,
  type DefDto,
  type TagDto,
} from "@/components/contacts/ContactFormModal";

type Props = {
  tenantId: string;
  role: string;
  initialContacts: SerializedContactDto[];
  initialNextCursor: string | null;
  fieldDefs: ContactCustomFieldDefDto[];
  allTags: ContactTagDto[];
};

export function ContactsPageClient({
  tenantId,
  role,
  initialContacts,
  initialNextCursor,
  fieldDefs: initialFieldDefs,
  allTags: initialAllTags,
}: Props) {
  const t = useTranslations("app.contacts");
  const readOnly = role === "support";
  const api = `/api/t/${tenantId}/contacts`;

  const [tab, setTab] = useState<"contacts" | "fields">("contacts");
  const [contacts, setContacts] = useState(initialContacts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fieldDefs, setFieldDefs] = useState(initialFieldDefs);
  const [allTags, setAllTags] = useState(initialAllTags);

  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; contact: SerializedContactDto }
    | null
  >(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const res = await fetch(`${api}?cursor=${nextCursor}&limit=50`);
    setLoadingMore(false);
    if (!res.ok) return;
    const j = (await res.json()) as {
      contacts: SerializedContactDto[];
      nextCursor: string | null;
    };
    setContacts((prev) => [...prev, ...j.contacts]);
    setNextCursor(j.nextCursor);
  }

  function handleSaved(contact: SerializedContactDto) {
    if (modal?.mode === "create") {
      setContacts((prev) => [contact, ...prev]);
    } else {
      setContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? contact : c)),
      );
    }
    // merge any new tags the server created into allTags
    setAllTags((prev) => {
      const existingIds = new Set(prev.map((tg) => tg.id));
      const newTags = contact.tags.filter((tg) => !existingIds.has(tg.id));
      return newTags.length > 0 ? [...prev, ...newTags] : prev;
    });
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteBusy(true);
    const res = await fetch(`${api}/${deleteId}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) return;
    setContacts((prev) => prev.filter((c) => c.id !== deleteId));
    setDeleteId(null);
  }

  async function reloadFieldDefs() {
    const res = await fetch(`/api/t/${tenantId}/contacts/field-definitions`);
    if (!res.ok) return;
    const j = (await res.json()) as { definitions: ContactCustomFieldDefDto[] };
    setFieldDefs(j.definitions);
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
          <ContactsTable
            contacts={contacts}
            readOnly={readOnly}
            onEdit={(c) => setModal({ mode: "edit", contact: c })}
            onDelete={(id) => setDeleteId(id)}
          />
          {nextCursor ? (
            <div className="flex justify-center">
              <button
                type="button"
                className="ds-btn-outline"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore ? t("loading") : t("loadMore")}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <FieldDefinitionsPanel
          tenantId={tenantId}
          definitions={fieldDefs}
          readOnly={readOnly}
          onUpdated={() => void reloadFieldDefs()}
        />
      )}

      <ContactFormModal
        tenantId={tenantId}
        open={modal !== null}
        mode={modal?.mode ?? "create"}
        contact={modal?.mode === "edit" ? modal.contact : null}
        allTags={allTags as TagDto[]}
        definitions={fieldDefs as DefDto[]}
        readOnly={readOnly}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
      />

      {deleteId ? (
        <DeleteConfirmDialog
          title={t("deleteContactTitle")}
          body={t("deleteContactBody")}
          confirmLabel={deleteBusy ? t("deleting") : t("deleteConfirm")}
          cancelLabel={t("cancel")}
          busy={deleteBusy}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteId(null)}
        />
      ) : null}
    </div>
  );
}
