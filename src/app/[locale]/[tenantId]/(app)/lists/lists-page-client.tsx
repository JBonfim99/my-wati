"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type ListRow = { id: string; name: string };
export type ContactRow = {
  id: string;
  phoneE164: string;
  name: string | null;
  email: string | null;
};

type Props = {
  tenantId: string;
  initialLists: ListRow[];
  initialContacts: ContactRow[];
};

export default function ListsPageClient({
  tenantId,
  initialLists,
  initialContacts,
}: Props) {
  const t = useTranslations("app.lists");
  const router = useRouter();
  const [lists, setLists] = useState<ListRow[]>(initialLists);
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLists(initialLists);
    setContacts(initialContacts);
  }, [initialLists, initialContacts]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const contactIds = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([id]) => id);
    const res = await fetch(`/api/t/${tenantId}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contactIds }),
    });
    if (!res.ok) return;
    setName("");
    setSelected({});
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="ds-page-title">{t("title")}</h1>
      <form
        onSubmit={(e) => void create(e)}
        className="ds-card space-y-4 p-5"
      >
        <label className="ds-label">
          {t("name")}
          <input
            name="list-name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="ds-input"
            placeholder={t("name")}
          />
        </label>
        <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-border bg-neutral-50/80 p-3 text-sm text-fg-secondary">
          {contacts.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-white"
            >
              <input
                type="checkbox"
                name={`contact-${c.id}`}
                className="h-4 w-4 rounded border-border-strong text-primary-600 focus:ring-primary-100"
                checked={Boolean(selected[c.id])}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, [c.id]: e.target.checked }))
                }
              />
              <span className="font-mono text-[13px]">{c.phoneE164}</span>
              {c.name ? ` · ${c.name}` : ""}
              {c.email ? (
                <span className="block text-xs text-fg-muted">{c.email}</span>
              ) : null}
            </label>
          ))}
        </div>
        <button type="submit" className="ds-btn-primary">
          {t("create")}
        </button>
      </form>
      <ul className="ds-list">
        {lists.map((l) => (
          <li key={l.id} className="px-4 py-3 text-sm font-medium text-fg">
            {l.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
