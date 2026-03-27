"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookUser,
  CheckCircle2,
  FileUp,
  ListPlus,
  Plus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { SerializedContactDto } from "@/lib/contacts/dto";
import type {
  ContactCustomFieldDefDto,
  ContactListSummaryDto,
  ContactTagDto,
} from "@/lib/contacts/queries";
import { awaitContactsJobSse } from "@/lib/contacts/contacts-job-sse-client";
import { validateAndNormalizeCustomValue } from "@/lib/contacts/validate-custom-value";
import type { FieldType } from "@/lib/contacts/validate-custom-value";
import type { ContactCustomFieldConfig } from "@/lib/db/schema";
import {
  ContactsTable,
  type ContactsTableSelection,
  type ContactsTableSelectionScopeMenu,
} from "./ContactsTable";
import { FieldDefinitionsPanel } from "./FieldDefinitionsPanel";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { ContactsFilterShell } from "./ContactsFilterShell";
import {
  buildContactsFilterQueryString,
  buildContactsListQuery,
  CONTACTS_LIST_PAGE_SIZE,
  emptyContactsListFilter,
  hasMeaningfulFilters,
  type ContactsListFilterState,
} from "./contacts-list-query";
import {
  ContactFormModal,
  type DefDto,
  type TagDto,
} from "@/components/contacts/ContactFormModal";
import { BulkCustomValueInput } from "./BulkCustomValueInput";
import { BulkListPickField } from "./BulkListPickField";
import { BulkTagSearchField } from "./BulkTagSearchField";
import { ContactImportWizard } from "./ContactImportWizard";
import { TenantFixedFieldsPanel } from "./TenantFixedFieldsPanel";

type Props = {
  tenantId: string;
  role: string;
  initialContacts: SerializedContactDto[];
  initialNextCursor: string | null;
  initialTotal: number;
  fieldDefs: ContactCustomFieldDefDto[];
  allTags: ContactTagDto[];
  allLists: ContactListSummaryDto[];
};

type BulkExtraModal =
  | null
  | { kind: "add_tags" }
  | { kind: "remove_tags" }
  | { kind: "add_lists" }
  | { kind: "remove_lists" }
  | { kind: "set_custom" }
  | { kind: "clear_custom" };

export function ContactsPageClient({
  tenantId,
  role,
  initialContacts,
  initialNextCursor,
  initialTotal,
  fieldDefs: initialFieldDefs,
  allTags: initialAllTags,
  allLists: initialAllLists,
}: Props) {
  const t = useTranslations("app.contacts");
  const readOnly = role === "support";
  const api = `/api/t/${tenantId}/contacts`;
  const bulkApi = `/api/t/${tenantId}/contacts/bulk`;
  const idsApi = `/api/t/${tenantId}/contacts/ids`;
  const exportApi = `/api/t/${tenantId}/contacts/export-csv`;

  const [tab, setTab] = useState<"contacts" | "fields">("contacts");
  const [contacts, setContacts] = useState(initialContacts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fieldDefs, setFieldDefs] = useState(initialFieldDefs);
  const [fieldDefsRefresh, setFieldDefsRefresh] = useState(0);
  const [allTags, setAllTags] = useState(initialAllTags);
  const [allLists, setAllLists] = useState(initialAllLists);

  const [listFilters, setListFilters] = useState<ContactsListFilterState>(
    () => emptyContactsListFilter(),
  );
  const [appliedFilters, setAppliedFilters] = useState<ContactsListFilterState>(
    () => emptyContactsListFilter(),
  );
  const [listBusy, setListBusy] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [organizationTotal, setOrganizationTotal] = useState(initialTotal);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [idsFetchLoading, setIdsFetchLoading] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(
    null,
  );
  const [bulkErrorMessage, setBulkErrorMessage] = useState<string | null>(null);
  const bulkFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const bulkErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBulkSuccess = useCallback((message: string) => {
    setBulkErrorMessage(null);
    if (bulkFeedbackTimerRef.current) {
      clearTimeout(bulkFeedbackTimerRef.current);
      bulkFeedbackTimerRef.current = null;
    }
    setBulkSuccessMessage(message);
    bulkFeedbackTimerRef.current = setTimeout(() => {
      setBulkSuccessMessage(null);
      bulkFeedbackTimerRef.current = null;
    }, 5500);
  }, []);

  const dismissBulkSuccess = useCallback(() => {
    if (bulkFeedbackTimerRef.current) {
      clearTimeout(bulkFeedbackTimerRef.current);
      bulkFeedbackTimerRef.current = null;
    }
    setBulkSuccessMessage(null);
  }, []);

  const showBulkError = useCallback((message: string) => {
    setBulkSuccessMessage(null);
    if (bulkErrorTimerRef.current) {
      clearTimeout(bulkErrorTimerRef.current);
      bulkErrorTimerRef.current = null;
    }
    setBulkErrorMessage(message);
    bulkErrorTimerRef.current = setTimeout(() => {
      setBulkErrorMessage(null);
      bulkErrorTimerRef.current = null;
    }, 9000);
  }, []);

  const dismissBulkError = useCallback(() => {
    if (bulkErrorTimerRef.current) {
      clearTimeout(bulkErrorTimerRef.current);
      bulkErrorTimerRef.current = null;
    }
    setBulkErrorMessage(null);
  }, []);

  type BulkJobResultPayload = {
    op: string;
    requestedContactIds: number;
    validContactIds: number;
  };

  type BulkPollOutcome =
    | { kind: "completed"; result: BulkJobResultPayload | null }
    | { kind: "failed"; reason: string | null }
    | { kind: "timeout" };

  const waitBulkJobSse = useCallback(
    async (jobId: string): Promise<BulkPollOutcome> => {
      const url = `${bulkApi}/${encodeURIComponent(jobId)}/stream`;
      const o = await awaitContactsJobSse({
        url,
        statusErrorMessage: t("bulkJobStatusError"),
      });
      return o as BulkPollOutcome;
    },
    [bulkApi, t],
  );

  useEffect(() => {
    return () => {
      if (bulkFeedbackTimerRef.current) {
        clearTimeout(bulkFeedbackTimerRef.current);
      }
      if (bulkErrorTimerRef.current) {
        clearTimeout(bulkErrorTimerRef.current);
      }
    };
  }, []);

  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; contact: SerializedContactDto }
    | null
  >(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [bulkExtra, setBulkExtra] = useState<BulkExtraModal>(null);
  const [bulkTagPick, setBulkTagPick] = useState<Set<string>>(() => new Set());
  const [bulkListPick, setBulkListPick] = useState<Set<string>>(() => new Set());
  const [bulkCustomFieldId, setBulkCustomFieldId] = useState("");
  const [bulkCustomValueRaw, setBulkCustomValueRaw] = useState("");
  const [bulkOpBusy, setBulkOpBusy] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);

  const hasActiveFilters = useMemo(
    () => hasMeaningfulFilters(appliedFilters),
    [appliedFilters],
  );

  const sortedTagsForModal = useMemo(
    () => [...allTags].sort((a, b) => a.name.localeCompare(b.name)),
    [allTags],
  );

  const sortedListsForModal = useMemo(
    () => [...allLists].sort((a, b) => a.name.localeCompare(b.name)),
    [allLists],
  );

  const sortedFieldDefsForModal = useMemo(
    () => [...fieldDefs].sort((a, b) => a.sortOrder - b.sortOrder),
    [fieldDefs],
  );

  const bulkCustomSelectedDef = useMemo(
    () => fieldDefs.find((d) => d.id === bulkCustomFieldId) ?? null,
    [fieldDefs, bulkCustomFieldId],
  );

  const bulkSetCustomSubmitEnabled = useMemo(() => {
    if (!bulkCustomSelectedDef) return false;
    const v = validateAndNormalizeCustomValue(
      bulkCustomSelectedDef.fieldType as FieldType,
      bulkCustomValueRaw,
      bulkCustomSelectedDef.config as ContactCustomFieldConfig | null,
    );
    return v.ok && v.value !== null && v.value !== undefined;
  }, [bulkCustomSelectedDef, bulkCustomValueRaw]);

  useEffect(() => {
    if (bulkExtra?.kind === "set_custom") {
      setBulkCustomValueRaw("");
    }
  }, [bulkCustomFieldId, bulkExtra?.kind]);

  const applyListFromServer = useCallback(
    async (f: ContactsListFilterState, cursor: string | null | undefined) => {
      const qs = buildContactsListQuery(f, {
        limit: CONTACTS_LIST_PAGE_SIZE,
        includeTotal: !cursor,
        ...(cursor ? { cursor } : {}),
      });
      const res = await fetch(`${api}?${qs}`);
      if (!res.ok) return null;
      const j = (await res.json()) as {
        contacts: SerializedContactDto[];
        nextCursor: string | null;
        total?: number;
        allLists?: ContactListSummaryDto[];
      };
      if (j.allLists) setAllLists(j.allLists);
      return j;
    },
    [api],
  );

  const refreshFirstPage = useCallback(async () => {
    setListBusy(true);
    const j = await applyListFromServer(appliedFilters, undefined);
    setListBusy(false);
    if (!j) return;
    setContacts(j.contacts);
    setNextCursor(j.nextCursor);
    if (typeof j.total === "number") setTotalCount(j.total);
  }, [applyListFromServer, appliedFilters]);

  const refreshOrganizationTotal = useCallback(async () => {
    const qs = buildContactsListQuery(emptyContactsListFilter(), {
      limit: CONTACTS_LIST_PAGE_SIZE,
      includeTotal: true,
    });
    const res = await fetch(`${api}?${qs}`);
    if (!res.ok) return;
    const j = (await res.json()) as { total?: number };
    if (typeof j.total === "number") setOrganizationTotal(j.total);
  }, [api]);

  const runQueuedBulkOp = useCallback(
    async (body: object, successMessage: string): Promise<boolean> => {
      setBulkOpBusy(true);
      const res = await fetch(bulkApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setBulkOpBusy(false);
        return false;
      }
      if (res.status !== 202) {
        setBulkOpBusy(false);
        return false;
      }
      const queued = (await res.json()) as { jobId?: string };
      if (!queued.jobId) {
        setBulkOpBusy(false);
        return false;
      }
      const outcome = await waitBulkJobSse(queued.jobId);
      setBulkOpBusy(false);
      setBulkExtra(null);
      await refreshFirstPage();
      setSelectedIds(new Set());
      if (outcome.kind === "completed") {
        showBulkSuccess(successMessage);
      } else if (outcome.kind === "failed") {
        showBulkError(outcome.reason ?? t("bulkJobFailed"));
      } else {
        showBulkSuccess(t("bulkJobTimeoutHint"));
      }
      return true;
    },
    [
      bulkApi,
      waitBulkJobSse,
      refreshFirstPage,
      showBulkError,
      showBulkSuccess,
      t,
    ],
  );

  async function handleApplyFilters() {
    setListBusy(true);
    setSelectedIds(new Set());
    setSelectionNotice(null);
    const j = await applyListFromServer(listFilters, undefined);
    setListBusy(false);
    if (!j) return;
    setContacts(j.contacts);
    setNextCursor(j.nextCursor);
    if (typeof j.total === "number") setTotalCount(j.total);
    setAppliedFilters({ ...listFilters });
  }

  async function handleClearFilters() {
    const e = emptyContactsListFilter();
    setListFilters(e);
    setListBusy(true);
    setSelectedIds(new Set());
    setSelectionNotice(null);
    const j = await applyListFromServer(e, undefined);
    setListBusy(false);
    if (!j) return;
    setContacts(j.contacts);
    setNextCursor(j.nextCursor);
    if (typeof j.total === "number") {
      setTotalCount(j.total);
      setOrganizationTotal(j.total);
    }
    setAppliedFilters(e);
  }

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const qs = buildContactsListQuery(appliedFilters, {
      limit: CONTACTS_LIST_PAGE_SIZE,
      cursor: nextCursor,
    });
    const res = await fetch(`${api}?${qs}`);
    setLoadingMore(false);
    if (!res.ok) return;
    const j = (await res.json()) as {
      contacts: SerializedContactDto[];
      nextCursor: string | null;
    };
    setContacts((prev) => [...prev, ...j.contacts]);
    setNextCursor(j.nextCursor);
  }

  async function fetchIdsAndSelect(f: ContactsListFilterState) {
    setIdsFetchLoading(true);
    setSelectionNotice(null);
    const qs = buildContactsFilterQueryString(f);
    const res = await fetch(`${idsApi}?${qs}`);
    setIdsFetchLoading(false);
    if (!res.ok) return;
    const j = (await res.json()) as {
      ids: number[];
      truncated: boolean;
      cap: number;
    };
    setSelectedIds(new Set(j.ids));
    if (j.truncated) {
      setSelectionNotice(
        t("bulkSelectionTruncated", { cap: j.cap }),
      );
    }
  }

  function toggleSelected(id: number) {
    setSelectionNotice(null);
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAllOnPage() {
    setSelectionNotice(null);
    const allSelected =
      contacts.length > 0 &&
      contacts.every((c) => selectedIds.has(c.id));
    if (allSelected) {
      // Só remover os IDs da lista carregada deixaria seleções vindas de
      // "Todos na organização" / "Todos filtrados" (fora do client) marcadas.
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds((prev) => {
      const n = new Set(prev);
      for (const c of contacts) n.add(c.id);
      return n;
    });
  }

  const selectionScopeMenu: ContactsTableSelectionScopeMenu | undefined =
    readOnly
      ? undefined
      : {
          hasActiveFilters,
          filteredTotal: totalCount,
          orgTotal: organizationTotal,
          loading: idsFetchLoading,
          onSelectFiltered: () => void fetchIdsAndSelect(appliedFilters),
          onSelectAllOrg: () =>
            void fetchIdsAndSelect(emptyContactsListFilter()),
        };

  const tableSelection: ContactsTableSelection | undefined = readOnly
    ? undefined
    : {
        selectedIds,
        onToggle: toggleSelected,
        onToggleAllOnPage: toggleAllOnPage,
      };

  function handleSaved(contact: SerializedContactDto) {
    if (modal?.mode === "create") {
      setContacts((prev) => [contact, ...prev]);
      setTotalCount((n) => n + 1);
      setOrganizationTotal((n) => n + 1);
    } else {
      setContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? contact : c)),
      );
    }
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
    setTotalCount((n) => Math.max(0, n - 1));
    setOrganizationTotal((n) => Math.max(0, n - 1));
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.delete(deleteId);
      return n;
    });
    setDeleteId(null);
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const res = await fetch(bulkApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "delete", ids }),
    });
    if (!res.ok) {
      setBulkBusy(false);
      return;
    }
    if (res.status !== 202) {
      setBulkBusy(false);
      return;
    }
    const queued = (await res.json()) as { jobId?: string };
    if (!queued.jobId) {
      setBulkBusy(false);
      return;
    }
    const outcome = await waitBulkJobSse(queued.jobId);
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    setSelectionNotice(null);
    await refreshFirstPage();
    if (outcome.kind === "completed") {
      const r = outcome.result;
      if (
        r &&
        r.op === "delete" &&
        typeof r.validContactIds === "number"
      ) {
        setOrganizationTotal((n) => Math.max(0, n - r.validContactIds));
      }
      showBulkSuccess(t("bulkFeedbackDeleted"));
    } else if (outcome.kind === "failed") {
      showBulkError(outcome.reason ?? t("bulkJobFailed"));
    } else {
      showBulkSuccess(t("bulkJobTimeoutHint"));
    }
  }

  function openBulkAddTags() {
    setBulkTagPick(new Set());
    setBulkExtra({ kind: "add_tags" });
  }

  function openBulkRemoveTags() {
    setBulkTagPick(new Set());
    setBulkExtra({ kind: "remove_tags" });
  }

  function openBulkAddLists() {
    setBulkListPick(new Set());
    setBulkExtra({ kind: "add_lists" });
  }

  function openBulkRemoveLists() {
    setBulkListPick(new Set());
    setBulkExtra({ kind: "remove_lists" });
  }

  function openBulkSetCustom() {
    setBulkCustomFieldId(sortedFieldDefsForModal[0]?.id ?? "");
    setBulkCustomValueRaw("");
    setBulkExtra({ kind: "set_custom" });
  }

  function openBulkClearCustom() {
    setBulkCustomFieldId(sortedFieldDefsForModal[0]?.id ?? "");
    setBulkExtra({ kind: "clear_custom" });
  }

  function addBulkTagPick(id: string) {
    setBulkTagPick((prev) => new Set(prev).add(id));
  }

  function removeBulkTagPick(id: string) {
    setBulkTagPick((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }

  function addBulkListPick(id: string) {
    setBulkListPick((prev) => new Set(prev).add(id));
  }

  function removeBulkListPick(id: string) {
    setBulkListPick((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }

  async function handleBulkExportCsv() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const res = await fetch(exportApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(href);
    showBulkSuccess(t("bulkFeedbackExportCsv"));
  }

  async function submitBulkExtra() {
    const ids = [...selectedIds];
    if (ids.length === 0 || !bulkExtra) return;

    if (bulkExtra.kind === "add_tags" || bulkExtra.kind === "remove_tags") {
      const tagIds = [...bulkTagPick].map((id) => Number(id));
      if (tagIds.length === 0) return;
      await runQueuedBulkOp(
        bulkExtra.kind === "add_tags"
          ? { op: "add_tags", ids, tagIds }
          : { op: "remove_tags", ids, tagIds },
        bulkExtra.kind === "add_tags"
          ? t("bulkFeedbackTagsAdded")
          : t("bulkFeedbackTagsRemoved"),
      );
      return;
    }

    if (bulkExtra.kind === "add_lists" || bulkExtra.kind === "remove_lists") {
      const listIds = [...bulkListPick].map((id) => Number(id));
      if (listIds.length === 0) return;
      await runQueuedBulkOp(
        bulkExtra.kind === "add_lists"
          ? { op: "add_to_lists", ids, listIds }
          : { op: "remove_from_lists", ids, listIds },
        bulkExtra.kind === "add_lists"
          ? t("bulkFeedbackListsAdded")
          : t("bulkFeedbackListsRemoved"),
      );
      return;
    }

    if (bulkExtra.kind === "clear_custom") {
      if (!bulkCustomFieldId) return;
      await runQueuedBulkOp(
        {
          op: "clear_custom_field",
          ids,
          fieldId: bulkCustomFieldId,
        },
        t("bulkFeedbackCustomCleared"),
      );
      return;
    }

    if (bulkExtra.kind === "set_custom") {
      if (!bulkCustomFieldId || !bulkCustomSelectedDef) return;
      const normalized = validateAndNormalizeCustomValue(
        bulkCustomSelectedDef.fieldType as FieldType,
        bulkCustomValueRaw,
        bulkCustomSelectedDef.config as ContactCustomFieldConfig | null,
      );
      if (
        !normalized.ok ||
        normalized.value === null ||
        normalized.value === undefined
      ) {
        return;
      }
      await runQueuedBulkOp(
        {
          op: "set_custom_field",
          ids,
          fieldId: bulkCustomFieldId,
          value: normalized.value,
        },
        t("bulkFeedbackCustomSet"),
      );
    }
  }

  async function reloadFieldDefs() {
    const res = await fetch(`/api/t/${tenantId}/contacts/field-definitions`);
    if (!res.ok) return;
    const j = (await res.json()) as { definitions: ContactCustomFieldDefDto[] };
    setFieldDefs(j.definitions);
    setFieldDefsRefresh((n) => n + 1);
  }

  const bulkExtraTitle =
    bulkExtra?.kind === "add_tags"
      ? t("bulkAddTagTitle")
      : bulkExtra?.kind === "remove_tags"
        ? t("bulkRemoveTagTitle")
        : bulkExtra?.kind === "add_lists"
          ? t("bulkAddListTitle")
          : bulkExtra?.kind === "remove_lists"
            ? t("bulkRemoveListTitle")
            : bulkExtra?.kind === "set_custom"
              ? t("bulkSetCustomTitle")
              : bulkExtra?.kind === "clear_custom"
                ? t("bulkClearCustomTitle")
                : "";

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
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                className="ds-btn-outline gap-2"
                onClick={() => setImportWizardOpen(true)}
              >
                <FileUp className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t("importCsv")}
              </button>
              <button
                type="button"
                className="ds-btn-primary gap-2"
                onClick={() => setModal({ mode: "create" })}
              >
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t("newContact")}
              </button>
            </div>
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
          <ContactsFilterShell
            allTags={allTags}
            allLists={allLists}
            fieldDefs={fieldDefs.map((d) => ({
              id: d.id,
              label: d.label,
              fieldType: d.fieldType as FieldType,
            }))}
            value={listFilters}
            onChange={setListFilters}
            onApply={() => void handleApplyFilters()}
            onClear={() => void handleClearFilters()}
            applying={listBusy}
            hasActiveFilters={hasActiveFilters}
            panelOpen={filterPanelOpen}
            onPanelOpenChange={setFilterPanelOpen}
            selectedCount={selectedIds.size}
            totalCount={totalCount}
            readOnly={readOnly}
            onBulkDeleteClick={() => setBulkDeleteOpen(true)}
            onBulkAddTagClick={() => openBulkAddTags()}
            onBulkRemoveTagClick={() => openBulkRemoveTags()}
            onBulkAddListClick={() => openBulkAddLists()}
            onBulkRemoveListClick={() => openBulkRemoveLists()}
            onBulkSetCustomClick={() => openBulkSetCustom()}
            onBulkClearCustomClick={() => openBulkClearCustom()}
            onBulkExportCsvClick={() => void handleBulkExportCsv()}
          />

          {selectionNotice ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {selectionNotice}
            </p>
          ) : null}

          {bulkSuccessMessage ? (
            <div
              className="flex items-start gap-3 rounded-lg border border-emerald-300/90 bg-emerald-50 px-3 py-2.5 shadow-sm"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="min-w-0 flex-1 text-sm font-medium text-emerald-950">
                {bulkSuccessMessage}
              </p>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-emerald-800 hover:bg-emerald-100/80"
                aria-label={t("bulkFeedbackDismiss")}
                onClick={dismissBulkSuccess}
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : null}

          {bulkErrorMessage ? (
            <div
              className="flex items-start gap-3 rounded-lg border border-red-300/90 bg-red-50 px-3 py-2.5 shadow-sm"
              role="alert"
            >
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-red-700"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="min-w-0 flex-1 text-sm font-medium text-red-950">
                {bulkErrorMessage}
              </p>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-red-800 hover:bg-red-100/80"
                aria-label={t("bulkErrorDismiss")}
                onClick={dismissBulkError}
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : null}

          <ContactsTable
            contacts={contacts}
            readOnly={readOnly}
            onEdit={(c) => setModal({ mode: "edit", contact: c })}
            onDelete={(id) => setDeleteId(id)}
            selection={tableSelection}
            selectionScopeMenu={selectionScopeMenu}
          />
          {nextCursor ? (
            <div className="flex justify-center">
              <button
                type="button"
                className="ds-btn-outline"
                disabled={loadingMore || listBusy}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore ? t("loading") : t("loadMore")}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-10">
          <FieldDefinitionsPanel
            tenantId={tenantId}
            readOnly={readOnly}
            refreshTrigger={fieldDefsRefresh}
            onUpdated={() => void reloadFieldDefs()}
          />
          <TenantFixedFieldsPanel tenantId={tenantId} readOnly={readOnly} />
        </div>
      )}

      <ContactFormModal
        tenantId={tenantId}
        open={modal !== null}
        mode={modal?.mode ?? "create"}
        contact={modal?.mode === "edit" ? modal.contact : null}
        allTags={allTags as TagDto[]}
        allLists={allLists}
        definitions={fieldDefs as DefDto[]}
        readOnly={readOnly}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
        onTagCreated={(tg) =>
          setAllTags((prev) =>
            prev.some((x) => x.id === tg.id) ? prev : [...prev, tg],
          )
        }
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

      {bulkDeleteOpen ? (
        <DeleteConfirmDialog
          title={t("bulkDeleteTitle")}
          body={t("bulkDeleteBody", { count: selectedIds.size })}
          confirmLabel={bulkBusy ? t("deleting") : t("deleteConfirm")}
          cancelLabel={t("cancel")}
          busy={bulkBusy}
          onConfirm={() => void handleBulkDelete()}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      ) : null}

      {bulkExtra ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-fg/30 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !bulkOpBusy && setBulkExtra(null)}
        >
          <div
            className={`w-full overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl ${
              bulkExtra.kind === "add_lists" || bulkExtra.kind === "remove_lists"
                ? "max-h-[min(92vh,640px)] max-w-lg"
                : "max-h-[min(90vh,520px)] max-w-md"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-semibold text-fg">
              {bulkExtraTitle}
            </p>

            {bulkExtra.kind === "add_tags" || bulkExtra.kind === "remove_tags" ? (
              <>
                <p className="mt-2 text-sm text-fg-secondary">
                  {bulkExtra.kind === "add_tags"
                    ? t("bulkAddTagHint")
                    : t("bulkRemoveTagHint")}
                </p>
                {sortedTagsForModal.length === 0 ? (
                  <p className="mt-4 text-sm text-fg-muted">
                    {t("filterNoTagsInOrg")}
                  </p>
                ) : (
                  <BulkTagSearchField
                    key={bulkExtra.kind}
                    tags={sortedTagsForModal.map((t) => ({
                      id: String(t.id),
                      name: t.name,
                    }))}
                    selectedIds={bulkTagPick}
                    onAdd={addBulkTagPick}
                    onRemove={removeBulkTagPick}
                  />
                )}
              </>
            ) : null}

            {bulkExtra.kind === "add_lists" ||
            bulkExtra.kind === "remove_lists" ? (
              <>
                <p className="mt-2 text-sm text-fg-secondary">
                  {bulkExtra.kind === "add_lists"
                    ? t("bulkAddListHint")
                    : t("bulkRemoveListHint")}
                </p>
                {sortedListsForModal.length === 0 ? (
                  <p className="mt-4 text-sm text-fg-muted">
                    {t("filterNoListsInOrg")}
                  </p>
                ) : (
                  <BulkListPickField
                    key={bulkExtra.kind}
                    lists={sortedListsForModal.map((l) => ({
                      id: String(l.id),
                      name: l.name,
                    }))}
                    selectedIds={bulkListPick}
                    onAdd={addBulkListPick}
                    onRemove={removeBulkListPick}
                  />
                )}
              </>
            ) : null}

            {bulkExtra.kind === "set_custom" ||
            bulkExtra.kind === "clear_custom" ? (
              <>
                <p className="mt-2 text-sm text-fg-secondary">
                  {bulkExtra.kind === "set_custom"
                    ? t("bulkSetCustomHint")
                    : t("bulkClearCustomHint")}
                </p>
                <label className="mt-4 block text-sm font-medium text-fg">
                  {t("bulkCustomFieldLabel")}
                  <select
                    className="ds-input mt-1 w-full"
                    value={bulkCustomFieldId}
                    onChange={(e) => setBulkCustomFieldId(e.target.value)}
                  >
                    {sortedFieldDefsForModal.length === 0 ? (
                      <option value="">{t("filterCustomFieldEmptyOrg")}</option>
                    ) : (
                      sortedFieldDefsForModal.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                {bulkExtra.kind === "set_custom" && bulkCustomSelectedDef ? (
                  <label className="mt-3 block text-sm font-medium text-fg">
                    {t("bulkCustomValueLabel")}
                    <BulkCustomValueInput
                      key={bulkCustomSelectedDef.id}
                      definition={bulkCustomSelectedDef}
                      value={bulkCustomValueRaw}
                      onChange={setBulkCustomValueRaw}
                    />
                  </label>
                ) : null}
              </>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="ds-btn-outline"
                disabled={bulkOpBusy}
                onClick={() => setBulkExtra(null)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="ds-btn-primary"
                disabled={
                  bulkOpBusy ||
                  (bulkExtra.kind === "add_tags" ||
                  bulkExtra.kind === "remove_tags"
                    ? bulkTagPick.size === 0
                    : false) ||
                  (bulkExtra.kind === "add_lists" ||
                  bulkExtra.kind === "remove_lists"
                    ? bulkListPick.size === 0
                    : false) ||
                  (bulkExtra.kind === "set_custom" &&
                    (sortedFieldDefsForModal.length === 0 ||
                      !bulkCustomFieldId ||
                      !bulkSetCustomSubmitEnabled)) ||
                  (bulkExtra.kind === "clear_custom" &&
                    (sortedFieldDefsForModal.length === 0 || !bulkCustomFieldId))
                }
                onClick={() => void submitBulkExtra()}
              >
                {bulkOpBusy ? t("bulkApplying") : t("bulkConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ContactImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        tenantId={tenantId}
        fieldDefs={fieldDefs.map((d) => ({
          id: d.id,
          label: d.label,
          fieldType: d.fieldType as FieldType,
        }))}
        allTags={allTags}
        onFinished={async (detail) => {
          await refreshFirstPage();
          await refreshOrganizationTotal();
          if (detail.status === "timeout") {
            showBulkSuccess(t("bulkJobTimeoutHint"));
          } else {
            showBulkSuccess(t("importDone"));
          }
        }}
      />
    </div>
  );
}
