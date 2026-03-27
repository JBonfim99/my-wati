"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { CONTACTS_LIST_PAGE_SIZE } from "../../contacts/_components/contacts-list-query";
import type { SerializedContactDto } from "@/lib/contacts/dto";

type ListSummary = { id: number; name: string };

type Props = {
  tenantId: string;
  list: ListSummary | null;
  onClose: () => void;
};

export function ListMembersModal({ tenantId, list, onClose }: Props) {
  const t = useTranslations("app.lists");
  const [items, setItems] = useState<SerializedContactDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = list !== null;

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!list) return;
      const base = `/api/t/${tenantId}/lists/${list.id}/contacts`;
      const qs = new URLSearchParams();
      qs.set("limit", String(CONTACTS_LIST_PAGE_SIZE));
      if (cursor) qs.set("cursor", cursor);
      const res = await fetch(`${base}?${qs.toString()}`);
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? t("listMembersError"));
      }
      const j = (await res.json()) as {
        contacts: SerializedContactDto[];
        nextCursor: string | null;
      };
      setItems((prev) => (append ? [...prev, ...j.contacts] : j.contacts));
      setNextCursor(j.nextCursor);
    },
    [list, tenantId, t],
  );

  useEffect(() => {
    if (!list) return;
    setItems([]);
    setNextCursor(null);
    setError(null);
    setLoading(true);
    void fetchPage(null, false)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t("listMembersError"));
      })
      .finally(() => setLoading(false));
  }, [list, fetchPage, t]);

  async function loadMore() {
    if (!list || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await fetchPage(nextCursor, true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("listMembersError"));
    } finally {
      setLoadingMore(false);
    }
  }

  if (!open || !list) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-fg/30 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="list-members-title"
      onClick={() => onClose()}
    >
      <div
        className="flex max-h-[min(70vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <h2
            id="list-members-title"
            className="font-display text-lg font-semibold leading-snug text-fg"
          >
            {t("listMembersTitle", { name: list.name })}
          </h2>
          <button
            type="button"
            className="ds-btn-ghost shrink-0 rounded-lg p-2"
            aria-label={t("listMembersClose")}
            onClick={onClose}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              {t("listMembersLoading")}
            </p>
          ) : error ? (
            <p className="py-6 text-center text-sm text-danger" role="alert">
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              {t("listMembersEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((c) => (
                <li key={c.id} className="py-3 first:pt-0">
                  <p className="font-medium text-fg">
                    {c.name?.trim() ? c.name : c.phoneE164}
                  </p>
                  {c.name?.trim() ? (
                    <p className="mt-0.5 text-sm tabular-nums text-fg-secondary">
                      {c.phoneE164}
                    </p>
                  ) : null}
                  {c.email ? (
                    <p className="mt-0.5 text-xs text-fg-muted">{c.email}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {nextCursor && !loading ? (
          <div className="border-t border-border px-5 py-3">
            <button
              type="button"
              className="ds-btn-outline w-full"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? t("listMembersLoading") : t("listMembersLoadMore")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
