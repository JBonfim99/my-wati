"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { MessageTemplateRecord } from "@/lib/meta/graph";

type ListRow = { id: number; name: string };

function templateOptionValue(tpl: MessageTemplateRecord): string {
  return JSON.stringify({ name: tpl.name, language: tpl.language });
}

function isApproved(tpl: MessageTemplateRecord): boolean {
  return (
    (tpl.status ?? "").toUpperCase() === "APPROVED" &&
    Boolean(tpl.name?.trim()) &&
    Boolean(tpl.language?.trim())
  );
}

type Props = {
  tenantId: string;
  initialLists: ListRow[];
};

export function NewCampaignForm({ tenantId, initialLists }: Props) {
  const t = useTranslations("app.campaigns");
  const router = useRouter();

  const [lists] = useState(initialLists);
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [listId, setListId] = useState(
    initialLists[0] !== undefined ? String(initialLists[0].id) : "",
  );
  const [err, setErr] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [approvedTemplates, setApprovedTemplates] = useState<
    MessageTemplateRecord[]
  >([]);

  useEffect(() => {
    void (async () => {
      setTemplatesLoading(true);
      setTemplatesError(null);
      const res = await fetch(`/api/t/${tenantId}/templates`);
      const data = (await res.json()) as {
        templates?: MessageTemplateRecord[];
        error?: string;
      };
      if (!res.ok) {
        setTemplatesError(
          data.error ?? "Não foi possível carregar os templates.",
        );
        setApprovedTemplates([]);
        setTemplateKey("");
        setTemplatesLoading(false);
        return;
      }
      const list = (data.templates ?? []).filter(isApproved);
      list.sort((a, b) => {
        const n = (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
        if (n !== 0) return n;
        return (a.language ?? "").localeCompare(b.language ?? "", "pt-BR");
      });
      setApprovedTemplates(list);
      setTemplateKey(list[0] ? templateOptionValue(list[0]) : "");
      setTemplatesLoading(false);
    })();
  }, [tenantId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!templateKey) {
      setErr(t("noTemplateSelected"));
      return;
    }
    let templateName: string;
    let templateLanguage: string;
    try {
      const parsed = JSON.parse(templateKey) as {
        name: string;
        language: string;
      };
      templateName = parsed.name;
      templateLanguage = parsed.language;
    } catch {
      setErr(t("noTemplateSelected"));
      return;
    }

    const listIdNum = Number.parseInt(listId, 10);
    const res = await fetch(`/api/t/${tenantId}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        templateName,
        templateLanguage,
        listId: listIdNum,
      }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setErr(j.error ?? "Erro");
      return;
    }
    router.push(`/${tenantId}/campaigns`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="ds-page-title">{t("new")}</h1>
        <p className="ds-subtitle mt-1">{t("newSubtitle")}</p>
      </div>
      <form
        onSubmit={(e) => void submit(e)}
        className="ds-card space-y-4 p-6"
      >
        <label className="ds-label">
          {t("name")}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="ds-input"
          />
        </label>
        <label className="ds-label">
          {t("template")}
          {templatesLoading ? (
            <p className="ds-subtitle mt-2">{t("templatesLoading")}</p>
          ) : templatesError ? (
            <p className="mt-2 text-sm text-amber-900">{templatesError}</p>
          ) : approvedTemplates.length === 0 ? (
            <p className="ds-subtitle mt-2">{t("noApprovedTemplates")}</p>
          ) : (
            <select
              required
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="ds-select"
            >
              {approvedTemplates.map((tpl) => (
                <option
                  key={`${tpl.id ?? tpl.name}-${tpl.language}`}
                  value={templateOptionValue(tpl)}
                >
                  {tpl.name} · {tpl.language}
                  {tpl.category ? ` · ${tpl.category}` : ""}
                </option>
              ))}
            </select>
          )}
          {!templatesLoading && !templatesError && approvedTemplates.length > 0 ? (
            <span className="mt-1.5 block text-xs text-fg-muted">
              {t("templateDropdownHint")}
            </span>
          ) : null}
        </label>
        <label className="ds-label">
          {t("list")}
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="ds-select"
          >
            {lists.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <button
          type="submit"
          disabled={
            templatesLoading ||
            Boolean(templatesError) ||
            approvedTemplates.length === 0
          }
          className="ds-btn-whatsapp disabled:cursor-not-allowed disabled:opacity-50"
        >
          Disparar campanha
        </button>
      </form>
    </div>
  );
}
