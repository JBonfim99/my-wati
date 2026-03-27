"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { parseTemplatePreviewModel } from "@/lib/meta/template-preview-model";
import { META_DELIVERY_ANALYTICS_SUMMARY } from "@/lib/campaigns/meta-delivery-analytics-notes";
import { WhatsAppTemplatePhonePreview } from "../../templates/_components/WhatsAppTemplatePhonePreview";

export type CampaignDetailDto = {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  listId: number | null;
  templateComponents: unknown[] | null;
  createdByLabel: string | null;
  firstSentAt: string | null;
  breakdown: {
    total: number;
    read: number;
    delivered: number;
    sent: number;
    failed: number;
    pending: number;
  };
};

const UI_CAMPAIGN_STATUSES = [
  "draft",
  "queued",
  "sending",
  "completed",
  "failed",
] as const;
type UiCampaignStatus = (typeof UI_CAMPAIGN_STATUSES)[number];

function isUiCampaignStatus(s: string): s is UiCampaignStatus {
  return (UI_CAMPAIGN_STATUSES as readonly string[]).includes(s);
}

type Props = {
  tenantId: string;
  detail: CampaignDetailDto;
};

function pct(n: number, total: number): string {
  if (total <= 0) return "0";
  const p = (n / total) * 100;
  return (Math.round(p * 10) / 10).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

export function CampaignDetailPageClient({ tenantId, detail }: Props) {
  const t = useTranslations("app.campaigns.detail");
  const tStatus = useTranslations("app.campaigns.status");

  const previewModel = useMemo(() => {
    const comps = detail.templateComponents;
    if (!comps || !Array.isArray(comps)) {
      return parseTemplatePreviewModel([]);
    }
    return parseTemplatePreviewModel(comps as unknown[]);
  }, [detail.templateComponents]);

  const { breakdown } = detail;
  const total = breakdown.total;
  const receivedOk = breakdown.sent + breakdown.delivered + breakdown.read;

  const segments = useMemo(
    () =>
      [
        {
          key: "read",
          n: breakdown.read,
          className: "bg-teal-500",
          label: t("distRead"),
        },
        {
          key: "delivered",
          n: breakdown.delivered,
          className: "bg-violet-500",
          label: t("distDelivered"),
        },
        {
          key: "sent",
          n: breakdown.sent,
          className: "bg-sky-500",
          label: t("distSent"),
        },
        {
          key: "failed",
          n: breakdown.failed,
          className: "bg-red-500",
          label: t("distFailed"),
        },
        {
          key: "pending",
          n: breakdown.pending,
          className: "bg-neutral-400",
          label: t("distPending"),
        },
      ].filter((s) => s.n > 0),
    [breakdown, t],
  );

  const sentOn =
    detail.firstSentAt != null
      ? new Date(detail.firstSentAt).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;

  const scheduledLabel =
    detail.scheduledAt != null
      ? new Date(detail.scheduledAt).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;

  return (
    <div className="campaign-detail-root space-y-8 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/${tenantId}/campaigns`}
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-primary-700 hover:text-primary-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("back")}
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            {detail.name}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {detail.templateName} · {detail.templateLanguage}
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-secondary">{t("sentAtLabel")}</dt>
              <dd className="font-medium text-fg">
                {sentOn ?? "—"}
              </dd>
            </div>
            {scheduledLabel ? (
              <div>
                <dt className="text-fg-secondary">{t("scheduledAtLabel")}</dt>
                <dd className="font-medium text-fg">{scheduledLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-fg-secondary">{t("sentByLabel")}</dt>
              <dd className="font-medium text-fg">
                {detail.createdByLabel ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-fg-secondary">{t("statusLabel")}</dt>
              <dd className="font-medium text-fg">
                {isUiCampaignStatus(detail.status)
                  ? tStatus(detail.status)
                  : detail.status}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            disabled
            title={META_DELIVERY_ANALYTICS_SUMMARY}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 opacity-60 shadow-sm"
          >
            <BarChart3 className="h-4 w-4" aria-hidden />
            {t("deliveryStatsSoon")}
          </button>
          <p className="max-w-xs text-xs text-fg-muted sm:text-right">
            {t("deliveryStatsHint")}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-8">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-fg">
              {t("audienceTitle")}
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                  {t("totalRecipients")}
                </p>
                <p className="mt-2 font-display text-4xl font-bold tabular-nums text-fg">
                  {total.toLocaleString("pt-BR")}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                  {t("receivedOk")}
                </p>
                <p className="mt-2 font-display text-4xl font-bold tabular-nums text-emerald-700">
                  {receivedOk.toLocaleString("pt-BR")}
                </p>
                {total > 0 ? (
                  <p className="mt-1 text-sm text-fg-muted">
                    {pct(receivedOk, total)}% {t("ofTotal")}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                {t("distributionTitle")}
              </p>
              {total === 0 ? (
                <p className="mt-3 text-sm text-fg-muted">{t("noRecipients")}</p>
              ) : (
                <>
                  <div className="mt-3 flex h-10 w-full overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-border">
                    {segments.map((s) => (
                      <div
                        key={s.key}
                        className={`${s.className} flex min-w-0 items-center justify-center px-1 text-[10px] font-bold text-white sm:text-xs`}
                        style={{ width: `${(s.n / total) * 100}%` }}
                        title={`${s.label}: ${s.n}`}
                      >
                        {(s.n / total) * 100 >= 8
                          ? `${s.n} (${pct(s.n, total)}%)`
                          : ""}
                      </div>
                    ))}
                  </div>
                  <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-fg-secondary">
                    {segments.map((s) => (
                      <li key={s.key} className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-sm ${s.className}`}
                        />
                        <span>
                          {s.label}:{" "}
                          <strong className="text-fg">
                            {s.n.toLocaleString("pt-BR")}
                          </strong>{" "}
                          ({pct(s.n, total)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-border bg-neutral-50/50 p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t("responsesSectionTitle")}
            </h2>
            <p className="mt-2 text-sm text-fg-secondary">{t("responsesPlaceholder")}</p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-fg-secondary">
            {t("templatePreview")}
          </p>
          <WhatsAppTemplatePhonePreview
            model={previewModel}
            businessName="Wati"
          />
        </aside>
      </div>
    </div>
  );
}
