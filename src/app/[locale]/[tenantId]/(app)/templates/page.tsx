"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import type { MessageTemplateRecord } from "@/lib/meta/graph";

function formatRejected(
  r: MessageTemplateRecord["rejected_reason"],
): string {
  if (r == null) return "—";
  if (typeof r === "string") return r;
  return r.message ?? JSON.stringify(r);
}

export default function TemplatesPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;
  const t = useTranslations("app.templates");
  const [rows, setRows] = useState<MessageTemplateRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/t/${tenantId}/templates`);
    const data = (await res.json()) as {
      templates?: MessageTemplateRecord[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? t("loadError"));
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(data.templates ?? []);
    setLoading(false);
  }, [t, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="ds-page-title">{t("title")}</h1>
          <p className="ds-subtitle mt-1">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ds-btn-outline ds-btn-sm gap-2 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            strokeWidth={1.5}
            aria-hidden
          />
          {loading ? t("loading") : t("refresh")}
        </button>
      </div>

      {error ? <div className="ds-alert-warning">{error}</div> : null}

      {!loading && !error && rows.length === 0 ? (
        <p className="ds-subtitle">{t("empty")}</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="ds-table-wrap">
          <table className="ds-table min-w-[800px]">
            <thead>
              <tr>
                <th>{t("col.name")}</th>
                <th>{t("col.language")}</th>
                <th>{t("col.category")}</th>
                <th>{t("col.subCategory")}</th>
                <th>{t("col.status")}</th>
                <th>{t("col.paramFormat")}</th>
                <th>{t("col.id")}</th>
                <th>{t("col.rejected")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tpl) => (
                <tr key={`${tpl.id ?? tpl.name}-${tpl.language}`}>
                  <td className="font-medium text-fg">{tpl.name ?? "—"}</td>
                  <td>{tpl.language ?? "—"}</td>
                  <td>{tpl.category ?? "—"}</td>
                  <td>{tpl.sub_category ?? "—"}</td>
                  <td>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        (tpl.status ?? "").toUpperCase() === "APPROVED"
                          ? "bg-success-soft text-green-800"
                          : "bg-neutral-100 text-fg-secondary"
                      }`}
                    >
                      {tpl.status ?? "—"}
                    </span>
                  </td>
                  <td>{tpl.parameter_format ?? "—"}</td>
                  <td className="max-w-[120px] truncate font-mono text-xs text-fg-muted">
                    {tpl.id ?? "—"}
                  </td>
                  <td className="max-w-[200px] truncate text-xs text-danger">
                    {formatRejected(tpl.rejected_reason)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {rows.some((r) => r.components?.length) ? (
        <details className="ds-card group p-4 open:shadow-md">
          <summary className="cursor-pointer text-sm font-semibold text-fg">
            {t("componentsJson")}
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs text-fg-secondary">
            {JSON.stringify(
              rows.map((r) => ({
                name: r.name,
                language: r.language,
                components: r.components,
              })),
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
