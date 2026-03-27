"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Loader2,
  Plus,
  Send,
  Signal,
  XCircle,
} from "lucide-react";
import {
  CAMPAIGNS_LIST_MUTATED_EVENT,
  dispatchCampaignsListMutated,
} from "@/lib/campaigns/campaigns-mutated-event";
import { uniqueRecipientsPer24hFromTier } from "@/lib/meta/whatsapp-display-limits";
import { CampaignMetricMicroBar } from "./CampaignMetricMicroBar";

type CampaignRow = {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  status: string;
  sentAt: string | null;
  scheduledAt: string | null;
  totalRecipients: number;
  sentOk: number;
  readCount: number;
  failedCount: number;
};

type Metrics = {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  processing: number;
  queued: number;
  totalRecipients: number;
};

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

function statusLabel(
  t: ReturnType<typeof useTranslations>,
  status: string,
): string {
  const keys = [
    "draft",
    "queued",
    "scheduled",
    "sending",
    "completed",
    "failed",
    "cancelled",
  ] as const;
  if (keys.includes(status as (typeof keys)[number])) {
    return t(`status.${status as (typeof keys)[number]}`);
  }
  return status;
}

function statusPillClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-600 text-white ring-1 ring-emerald-800/40";
    case "failed":
      return "bg-red-600 text-white ring-1 ring-red-900/35";
    case "cancelled":
      return "bg-neutral-500 text-white ring-1 ring-neutral-800/35";
    case "scheduled":
      return "bg-amber-600 text-white ring-1 ring-amber-900/35";
    case "sending":
    case "queued":
      return "bg-sky-600 text-white ring-1 ring-sky-900/30";
    default:
      return "bg-neutral-600 text-white ring-1 ring-neutral-900/25";
  }
}

function qualityTone(
  q: string | undefined,
): { className: string; label: string } {
  const u = (q ?? "").toUpperCase();
  if (u === "GREEN")
    return { className: "bg-emerald-600 text-white ring-1 ring-emerald-800/35", label: "GREEN" };
  if (u === "YELLOW")
    return { className: "bg-amber-500 text-white ring-1 ring-amber-800/35", label: "YELLOW" };
  if (u === "RED")
    return { className: "bg-red-600 text-white ring-1 ring-red-900/35", label: "RED" };
  return { className: "bg-neutral-500 text-white ring-1 ring-neutral-800/30", label: q ?? "—" };
}

function mayCancelCampaignRow(status: string): boolean {
  return status === "scheduled" || status === "queued";
}

function formatPctOfTotal(value: number, total: number): string | null {
  if (total <= 0 || !Number.isFinite(value)) return null;
  const p = (value / total) * 100;
  const r = Math.round(p * 10) / 10;
  return r.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

type KpiProps = {
  icon: ReactNode;
  label: string;
  value: number;
  accent: string;
  /** Texto já interpolado (ex.: i18n com %). */
  pctLine: string | null;
};

function KpiCard({ icon, label, value, accent, pctLine }: KpiProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow duration-300 hover:shadow-md ${accent}`}
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-current opacity-[0.07] transition-transform duration-500 group-hover:scale-110" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
            {label}
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-fg">
            {value.toLocaleString("pt-BR")}
          </p>
          {pctLine ? (
            <p className="mt-1.5 truncate text-sm font-semibold tabular-nums text-fg-secondary">
              {pctLine}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl bg-white/80 p-2.5 text-current shadow-sm ring-1 ring-black/5">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function CampaignsOverviewClient() {
  const t = useTranslations("app.campaigns");
  const tDetail = useTranslations("app.campaigns.detail");
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;

  const [range, setRange] = useState(defaultDateRange);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [templateFilter, setTemplateFilter] = useState("");
  const [templateNames, setTemplateNames] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [phone, setPhone] = useState<{
    ok: boolean;
    data?: Record<string, unknown>;
    error?: string;
  } | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadInsights = useCallback(async () => {
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    const res = await fetch(
      `/api/t/${tenantId}/campaigns/insights?${qs.toString()}`,
    );
    if (!res.ok) {
      setMetrics(null);
      setPhone(null);
      return;
    }
    const j = (await res.json()) as {
      metrics: Metrics;
      phoneHealth: { ok: boolean; data?: Record<string, unknown>; error?: string };
    };
    setMetrics({
      ...j.metrics,
      totalRecipients: j.metrics.totalRecipients ?? 0,
    });
    setPhone(j.phoneHealth);
  }, [tenantId, range.from, range.to]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/t/${tenantId}/campaigns/template-options`,
      );
      if (!res.ok) return;
      const j = (await res.json()) as { templateNames?: string[] };
      setTemplateNames(j.templateNames ?? []);
    })();
  }, [tenantId]);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchDraft), 320);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  useEffect(() => {
    setPage(1);
  }, [search, templateFilter, statusFilter, range.from, range.to]);

  const loadList = useCallback(async () => {
    setListBusy(true);
    try {
      const qs = new URLSearchParams({
        from: range.from,
        to: range.to,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter) qs.set("status", statusFilter);
      if (search.trim()) qs.set("q", search.trim());
      if (templateFilter.trim()) qs.set("template", templateFilter.trim());
      const res = await fetch(`/api/t/${tenantId}/campaigns?${qs}`);
      if (!res.ok) return;
      const j = (await res.json()) as {
        campaigns: CampaignRow[];
        total: number;
      };
      setRows(j.campaigns);
      setTotal(j.total);
    } finally {
      setListBusy(false);
    }
  }, [tenantId, range.from, range.to, statusFilter, search, templateFilter, page, pageSize]);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    const onMutated = () => void loadList();
    window.addEventListener(CAMPAIGNS_LIST_MUTATED_EVENT, onMutated);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadList();
    }, 25000);
    return () => {
      window.removeEventListener(CAMPAIGNS_LIST_MUTATED_EVENT, onMutated);
      window.clearInterval(intervalId);
    };
  }, [loadList]);

  const cancelCampaignFromRow = useCallback(
    async (campaignId: string) => {
      if (!window.confirm(tDetail("cancelConfirm"))) return;
      setCancellingId(campaignId);
      try {
        const res = await fetch(
          `/api/t/${tenantId}/campaigns/${campaignId}/cancel`,
          { method: "POST" },
        );
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          window.alert(j.error ?? tDetail("cancelError"));
          return;
        }
        dispatchCampaignsListMutated();
        await loadList();
      } catch {
        window.alert(tDetail("cancelError"));
      } finally {
        setCancellingId(null);
      }
    },
    [tenantId, loadList, tDetail],
  );

  const phoneData = phone?.ok ? phone.data : null;
  const qTone = qualityTone(
    typeof phoneData?.qualityRating === "string"
      ? phoneData.qualityRating
      : undefined,
  );

  const metaCards = useMemo(() => {
    const shell =
      "relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-white via-emerald-50/40 to-white p-6 shadow-card ring-1 ring-emerald-900/5";
    const bg = (
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 60% at 100% 0%, rgb(16 185 129 / 0.12), transparent),
            radial-gradient(ellipse 60% 50% at 0% 100%, rgb(20 184 166 / 0.1), transparent)`,
        }}
      />
    );
    const tierRaw =
      typeof phoneData?.whatsappBusinessManagerMessagingLimit === "string"
        ? phoneData.whatsappBusinessManagerMessagingLimit
        : typeof phoneData?.messagingLimitTier === "string"
          ? phoneData.messagingLimitTier
          : undefined;
    const { value: limitN, unlimited } = uniqueRecipientsPer24hFromTier(tierRaw);

    const limitMain = unlimited
      ? t("overviewMessagingUnlimited")
      : limitN != null
        ? t("overviewMessagingLimit24h", {
            value: limitN.toLocaleString("pt-BR"),
          })
        : tierRaw
          ? t("overviewMessagingTierRaw", { tier: tierRaw })
          : "—";

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className={shell}>
          {bg}
          <h3 className="relative font-display text-sm font-semibold text-fg">
            {t("overviewMetaLimitTitle")}
          </h3>
          <p className="relative mt-1 text-xs text-fg-secondary">
            {t("overviewMetaLimitHint")}
          </p>
          <p className="relative mt-6 font-display text-3xl font-bold tabular-nums leading-tight text-fg sm:text-4xl">
            {limitMain}
          </p>
          {phone !== null && !phone.ok ? (
            <p className="relative mt-4 text-xs text-amber-800">
              {phone.error ?? t("overviewMetaUnavailable")}
            </p>
          ) : null}
        </div>
        <div className={shell}>
          {bg}
          <h3 className="relative font-display text-sm font-semibold text-fg">
            {t("overviewNumberQualityTitle")}
          </h3>
          <p className="relative mt-1 text-xs text-fg-secondary">
            {t("overviewNumberQualityHint")}
          </p>
          <div className="relative mt-6 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-bold ${qTone.className}`}
            >
              <Signal className="h-5 w-5" strokeWidth={2} aria-hidden />
              {qTone.label}
            </span>
          </div>
          {phoneData?.displayPhoneNumber ? (
            <p className="relative mt-5 font-mono text-sm text-fg-secondary">
              {String(phoneData.displayPhoneNumber)}
            </p>
          ) : null}
        </div>
      </div>
    );
  }, [phone, phoneData, qTone, t]);

  return (
    <div className="campaigns-overview-root space-y-10 pb-16">
      <header className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-8 shadow-md sm:px-10 sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45]"
          style={{
            backgroundImage: `linear-gradient(115deg, rgb(16 185 129 / 0.08) 0%, transparent 42%),
              linear-gradient(300deg, rgb(79 70 229 / 0.06) 0%, transparent 48%),
              url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              {t("overviewKicker")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              {t("overviewTitle")}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-fg-secondary">
              {t("overviewSubtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${tenantId}/campaigns/new`}
              className="ds-btn-primary inline-flex items-center gap-2 no-underline"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("new")}
            </Link>
          </div>
        </div>
      </header>

      {metaCards}

      {metrics ? (
        <section>
          <h2 className="mb-4 font-display text-lg font-semibold text-fg">
            {t("overviewMetricsTitle")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              accent="text-emerald-600"
              label={t("metricSent")}
              value={metrics.sent}
              pctLine={(() => {
                const p = formatPctOfTotal(metrics.sent, metrics.totalRecipients);
                return p != null
                  ? t("metricShareRecipients", { pct: p })
                  : null;
              })()}
              icon={<Check className="h-5 w-5" strokeWidth={2} aria-hidden />}
            />
            <KpiCard
              accent="text-teal-600"
              label={t("metricDelivered")}
              value={metrics.delivered}
              pctLine={(() => {
                const p = formatPctOfTotal(
                  metrics.delivered,
                  metrics.totalRecipients,
                );
                return p != null
                  ? t("metricShareRecipients", { pct: p })
                  : null;
              })()}
              icon={<CheckCheck className="h-5 w-5" strokeWidth={2} aria-hidden />}
            />
            <KpiCard
              accent="text-indigo-600"
              label={t("metricRead")}
              value={metrics.read}
              pctLine={(() => {
                const p = formatPctOfTotal(metrics.read, metrics.totalRecipients);
                return p != null
                  ? t("metricShareRecipients", { pct: p })
                  : null;
              })()}
              icon={<Eye className="h-5 w-5" strokeWidth={2} aria-hidden />}
            />
            <KpiCard
              accent="text-sky-600"
              label={t("metricSending")}
              value={metrics.processing}
              pctLine={(() => {
                const p = formatPctOfTotal(
                  metrics.processing,
                  metrics.totalRecipients,
                );
                return p != null
                  ? t("metricShareRecipients", { pct: p })
                  : null;
              })()}
              icon={<Send className="h-5 w-5" strokeWidth={2} aria-hidden />}
            />
            <KpiCard
              accent="text-red-600"
              label={t("metricFailed")}
              value={metrics.failed}
              pctLine={(() => {
                const p = formatPctOfTotal(
                  metrics.failed,
                  metrics.totalRecipients,
                );
                return p != null
                  ? t("metricShareRecipients", { pct: p })
                  : null;
              })()}
              icon={<XCircle className="h-5 w-5" strokeWidth={2} aria-hidden />}
            />
            <KpiCard
              accent="text-violet-600"
              label={t("metricQueued")}
              value={metrics.queued}
              pctLine={(() => {
                const p = formatPctOfTotal(
                  metrics.queued,
                  metrics.totalRecipients,
                );
                return p != null
                  ? t("metricShareRecipients", { pct: p })
                  : null;
              })()}
              icon={<Layers className="h-5 w-5" strokeWidth={2} aria-hidden />}
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-fg">
          {t("overviewTableTitle")}
        </h2>
        <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto pb-0.5">
          <input
            type="search"
            className="ds-input !w-40 shrink-0 !py-2 text-sm sm:!w-52"
            placeholder={t("overviewSearchPlaceholder")}
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            aria-label={t("overviewSearchPlaceholder")}
          />
          <select
            className="ds-select !w-[min(11rem,100%)] shrink-0 !py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t("overviewStatusFilter")}
          >
            <option value="">{t("overviewAllStatuses")}</option>
            <option value="draft">{t("status.draft")}</option>
            <option value="queued">{t("status.queued")}</option>
            <option value="scheduled">{t("status.scheduled")}</option>
            <option value="sending">{t("status.sending")}</option>
            <option value="completed">{t("status.completed")}</option>
            <option value="failed">{t("status.failed")}</option>
            <option value="cancelled">{t("status.cancelled")}</option>
          </select>
          <select
            className="ds-select !min-w-[10rem] shrink-0 !py-2 text-sm"
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            aria-label={t("overviewTemplateAll")}
          >
            <option value="">{t("overviewTemplateAll")}</option>
            {templateNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <label className="ds-label mb-0 w-[132px] shrink-0 text-[10px] uppercase tracking-wide">
            {t("overviewDateFrom")}
            <input
              type="date"
              value={range.from}
              onChange={(e) =>
                setRange((r) => ({ ...r, from: e.target.value }))
              }
              className="ds-input !py-2 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="ds-label mb-0 w-[132px] shrink-0 text-[10px] uppercase tracking-wide">
            {t("overviewDateTo")}
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="ds-input !py-2 text-sm normal-case tracking-normal"
            />
          </label>
          <button
            type="button"
            className="ds-btn-outline shrink-0 !py-2 text-sm"
            onClick={() => setSearch(searchDraft)}
          >
            {t("overviewSearch")}
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
          <table className="min-w-[940px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-neutral-50/90 text-xs font-semibold uppercase tracking-wide text-fg-secondary">
                <th className="px-4 py-3">{t("colCampaign")}</th>
                <th className="px-4 py-3 text-right">{t("colRecipients")}</th>
                <th className="px-4 py-3 text-right">{t("colSentOk")}</th>
                <th className="px-4 py-3 text-right">{t("colRead")}</th>
                <th className="px-4 py-3 text-right">{t("colFailed")}</th>
                <th className="px-4 py-3">{t("colStatus")}</th>
                <th className="px-4 py-3">{t("colSent")}</th>
                <th className="w-px whitespace-nowrap px-4 py-3 text-right">
                  {t("colActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {listBusy && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-fg-muted">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin opacity-40" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-fg-secondary">
                    {t("overviewEmpty")}
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const pctSent = formatPctOfTotal(c.sentOk, c.totalRecipients);
                  const pctRead = formatPctOfTotal(
                    c.readCount,
                    c.totalRecipients,
                  );
                  const pctFail = formatPctOfTotal(
                    c.failedCount,
                    c.totalRecipients,
                  );
                  return (
                  <tr
                    key={c.id}
                    className="border-b border-border/80 transition-colors hover:bg-neutral-50/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/${tenantId}/campaigns/${c.id}`}
                        className="font-semibold text-primary-700 hover:text-primary-900 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-fg-muted">
                        {c.templateName} · {c.templateLanguage}
                      </div>
                      {c.scheduledAt ? (
                        <div className="mt-1 text-xs font-medium text-amber-800/90">
                          {t("rowScheduledAt", {
                            datetime: new Date(c.scheduledAt).toLocaleString(
                              "pt-BR",
                              {
                                dateStyle: "short",
                                timeStyle: "short",
                              },
                            ),
                          })}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.totalRecipients}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="tabular-nums text-emerald-800">
                          {c.sentOk}
                          {pctSent ? (
                            <span className="text-fg-secondary">
                              {" "}({pctSent}%)
                            </span>
                          ) : null}
                        </span>
                        <CampaignMetricMicroBar
                          value={c.sentOk}
                          total={c.totalRecipients}
                          colorClass="bg-emerald-500"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="tabular-nums text-fg">
                          {c.readCount}
                          {pctRead ? (
                            <span className="text-fg-secondary">
                              {" "}({pctRead}%)
                            </span>
                          ) : null}
                        </span>
                        <CampaignMetricMicroBar
                          value={c.readCount}
                          total={c.totalRecipients}
                          colorClass="bg-indigo-500"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="tabular-nums text-red-700">
                          {c.failedCount}
                          {pctFail ? (
                            <span className="text-fg-secondary">
                              {" "}({pctFail}%)
                            </span>
                          ) : null}
                        </span>
                        <CampaignMetricMicroBar
                          value={c.failedCount}
                          total={c.totalRecipients}
                          colorClass="bg-red-500"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusPillClass(c.status)}`}
                      >
                        {statusLabel(t, c.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-secondary">
                      {c.sentAt
                        ? new Date(c.sentAt).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {mayCancelCampaignRow(c.status) ? (
                        <button
                          type="button"
                          disabled={
                            cancellingId === c.id || listBusy
                          }
                          onClick={() => void cancelCampaignFromRow(c.id)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-45"
                          title={tDetail("cancelQueue")}
                          aria-label={tDetail("cancelQueue")}
                        >
                          {cancellingId === c.id ? (
                            <Loader2
                              className="h-4 w-4 shrink-0 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Ban className="h-4 w-4 shrink-0" aria-hidden />
                          )}
                          <span className="hidden sm:inline">
                            {cancellingId === c.id
                              ? tDetail("cancelBusy")
                              : tDetail("cancelQueue")}
                          </span>
                        </button>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-secondary">
          <p>
            {t("overviewPageOf", {
              page,
              totalPages,
              total,
            })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="ds-btn-outline inline-flex items-center gap-1 !py-1.5 text-sm disabled:opacity-40"
              disabled={page <= 1 || listBusy}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {t("overviewPrev")}
            </button>
            <button
              type="button"
              className="ds-btn-outline inline-flex items-center gap-1 !py-1.5 text-sm disabled:opacity-40"
              disabled={page >= totalPages || listBusy}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("overviewNext")}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
