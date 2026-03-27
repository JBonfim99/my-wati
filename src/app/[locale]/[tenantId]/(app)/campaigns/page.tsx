"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

function campaignStatusTranslationKey(
  status: string,
):
  | "status.draft"
  | "status.queued"
  | "status.sending"
  | "status.completed"
  | "status.failed"
  | null {
  if (
    status === "draft" ||
    status === "queued" ||
    status === "sending" ||
    status === "completed" ||
    status === "failed"
  ) {
    return `status.${status}`;
  }
  return null;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-success-soft text-green-800";
    case "failed":
      return "bg-danger-soft text-red-800";
    case "sending":
    case "queued":
      return "bg-primary-50 text-primary-700";
    case "draft":
    default:
      return "bg-neutral-100 text-fg-secondary";
  }
}

type Campaign = {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  status: string;
};

export default function CampaignsPage() {
  const t = useTranslations("app.campaigns");
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;
  const [rows, setRows] = useState<Campaign[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/t/${tenantId}/campaigns`);
      if (!res.ok) return;
      const data = (await res.json()) as { campaigns: Campaign[] };
      setRows(data.campaigns);
    })();
  }, [tenantId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="ds-page-title">{t("title")}</h1>
        <Link
          href={`/${tenantId}/campaigns/new`}
          className="ds-btn-primary gap-2 no-underline"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("new")}
        </Link>
      </div>
      <ul className="ds-list">
        {rows.map((c) => {
          const statusKey = campaignStatusTranslationKey(c.status);
          const label = statusKey ? t(statusKey) : c.status;
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <div className="font-semibold text-fg">{c.name}</div>
                <div className="text-fg-secondary">
                  {c.templateName} · {c.templateLanguage}
                </div>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(c.status)}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
