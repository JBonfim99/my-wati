"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";
import type { MessageTemplateRecord } from "@/lib/meta/graph";
import { parseTemplatePreviewModel } from "@/lib/meta/template-preview-model";
import { WhatsAppTemplatePhonePreview } from "../../../templates/_components/WhatsAppTemplatePhonePreview";
import {
  estimateCampaignCostUsd,
  normalizeTemplateCategory,
  usdPerMessageForCategory,
  type TemplatePricingCategory,
} from "@/lib/campaigns/pricing";

type ListOpt = { id: number; name: string; memberCount: number };

type Props = {
  tenantId: string;
  initialLists: ListOpt[];
};

function templateOptionValue(tpl: MessageTemplateRecord): string {
  return JSON.stringify({
    name: (tpl.name ?? "").trim(),
    language: (tpl.language ?? "").trim(),
  });
}

function isApproved(tpl: MessageTemplateRecord): boolean {
  return (
    (tpl.status ?? "").toUpperCase() === "APPROVED" &&
    Boolean(tpl.name?.trim()) &&
    Boolean(tpl.language?.trim())
  );
}

function minDateTimeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function CostBlock(props: {
  category: TemplatePricingCategory;
  recipients: number;
  usdRate: number | null;
}) {
  const t = useTranslations("app.campaigns");
  const { category, recipients, usdRate } = props;
  const unit = usdPerMessageForCategory(category);
  const totalUsd = estimateCampaignCostUsd(category, recipients);
  const totalBrl =
    usdRate != null && Number.isFinite(usdRate)
      ? Math.round(totalUsd * usdRate * 100) / 100
      : null;

  return (
    <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-900/80">
        {t("costEstimateTitle")}
      </p>
      <p className="mt-1 text-sm text-fg-secondary">{t("costEstimateHint")}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-fg">
        <li>
          <span className="text-fg-secondary">{t("costCategory")}</span>{" "}
          <span className="font-medium">{category}</span> —{" "}
          {t("costPerMessage", { usd: unit.toFixed(2) })}
        </li>
        <li>
          <span className="text-fg-secondary">{t("costRecipients")}</span>{" "}
          <span className="font-mono font-semibold">{recipients}</span>
        </li>
        <li className="border-t border-emerald-100 pt-2 font-display text-lg font-bold text-emerald-950">
          ≈ US$ {totalUsd.toFixed(2)}
          {totalBrl != null ? (
            <span className="ml-2 text-base font-semibold text-fg-secondary">
              (~R$ {totalBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
            </span>
          ) : (
            <span className="ml-2 text-sm font-normal text-fg-muted">
              {t("costBrlUnavailable")}
            </span>
          )}
        </li>
      </ul>
    </div>
  );
}

export function NewCampaignForm({ tenantId, initialLists }: Props) {
  const t = useTranslations("app.campaigns");
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [listId, setListId] = useState<number | "">(
    initialLists[0]?.id ?? "",
  );
  const [templateKey, setTemplateKey] = useState("");
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [approvedTemplates, setApprovedTemplates] = useState<
    MessageTemplateRecord[]
  >([]);
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [scheduleMin, setScheduleMin] = useState(minDateTimeLocal);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [usdBrl, setUsdBrl] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setScheduleMin(minDateTimeLocal());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

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
        setTemplatesError(data.error ?? t("templatesLoadError"));
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
  }, [tenantId, t]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/t/${tenantId}/fx/usd-brl`);
      if (!res.ok) {
        setUsdBrl(null);
        return;
      }
      const j = (await res.json()) as { rate?: number };
      setUsdBrl(typeof j.rate === "number" ? j.rate : null);
    })();
  }, [tenantId, pathname]);

  const selectedList = useMemo(
    () => initialLists.find((l) => l.id === listId),
    [initialLists, listId],
  );

  const selectedTemplate = useMemo(
    () => approvedTemplates.find((x) => templateOptionValue(x) === templateKey),
    [approvedTemplates, templateKey],
  );

  const previewModel = useMemo(() => {
    const comps = selectedTemplate?.components;
    if (!comps || !Array.isArray(comps)) {
      return parseTemplatePreviewModel([]);
    }
    return parseTemplatePreviewModel(comps as unknown[]);
  }, [selectedTemplate]);

  const pricingCategory = normalizeTemplateCategory(
    selectedTemplate?.category,
  );
  const recipientCount = selectedList?.memberCount ?? 0;

  function validateSchedule(): string | null {
    if (sendMode !== "schedule") return null;
    if (!scheduleLocal.trim()) return t("errorScheduleRequired");
    const tMs = new Date(scheduleLocal).getTime();
    if (Number.isNaN(tMs)) return t("errorInvalidSchedule");
    if (tMs <= Date.now()) return t("errorSchedulePast");
    return null;
  }

  async function submit() {
    setFormError(null);
    if (!name.trim()) {
      setFormError(t("errorNameRequired"));
      return;
    }
    if (listId === "") {
      setFormError(t("errorListRequired"));
      return;
    }
    if (!templateKey) {
      setFormError(t("noTemplateSelected"));
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
      setFormError(t("noTemplateSelected"));
      return;
    }
    const schedErr = validateSchedule();
    if (schedErr) {
      setFormError(schedErr);
      return;
    }
    if (recipientCount === 0) {
      setFormError(t("errorEmptyList"));
      return;
    }

    setSubmitBusy(true);
    try {
      const scheduledAtIso =
        sendMode === "schedule" && scheduleLocal
          ? new Date(scheduleLocal).toISOString()
          : undefined;
      const templateComponents = Array.isArray(selectedTemplate?.components)
        ? selectedTemplate.components
        : undefined;
      const res = await fetch(`/api/t/${tenantId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          templateName,
          templateLanguage,
          listId,
          ...(templateComponents ? { templateComponents } : {}),
          ...(scheduledAtIso ? { scheduledAt: scheduledAtIso } : {}),
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormError(j.error ?? t("submitError"));
        return;
      }
      setReviewOpen(false);
      router.push(`/${tenantId}/campaigns`);
    } catch {
      setFormError(t("submitError"));
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <div className="campaigns-new-root mx-auto max-w-5xl px-4 pb-24 pt-10">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            WhatsApp
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-fg md:text-4xl">
            {t("new")}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-fg-secondary">{t("newSubtitle")}</p>
        </div>
        <Link
          href={`/${tenantId}/campaigns`}
          className="ds-btn-outline text-sm no-underline"
        >
          {t("backToList")}
        </Link>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_min(100%,380px)] lg:items-start">
        <div className="space-y-8">
          <section className="ds-card space-y-4 p-6 shadow-md">
            <h2 className="font-display text-lg font-semibold text-fg">
              {t("sectionBasics")}
            </h2>
            <label className="ds-label">
              {t("name")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ds-input"
                placeholder={t("namePlaceholder")}
              />
            </label>
            <label className="ds-label">
              {t("list")}
              <select
                className="ds-select"
                value={listId === "" ? "" : String(listId)}
                onChange={(e) =>
                  setListId(
                    e.target.value === "" ? "" : Number.parseInt(e.target.value, 10),
                  )
                }
              >
                {initialLists.length === 0 ? (
                  <option value="">{t("noLists")}</option>
                ) : null}
                {initialLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.memberCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="ds-label">
              {t("template")}
              {templatesLoading ? (
                <p className="ds-subtitle mt-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("templatesLoading")}
                </p>
              ) : templatesError ? (
                <p className="mt-2 text-sm text-amber-900">{templatesError}</p>
              ) : approvedTemplates.length === 0 ? (
                <p className="ds-subtitle mt-2">{t("noApprovedTemplates")}</p>
              ) : (
                <select
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  className="ds-select"
                >
                  {approvedTemplates.map((tpl) => (
                    <option
                      key={`${tpl.id ?? tpl.name}-${tpl.language}`}
                      value={templateOptionValue(tpl)}
                    >
                      {tpl.name} · {tpl.language} · {tpl.category ?? "—"}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </section>

          <section className="ds-card space-y-4 p-6 shadow-md">
            <h2 className="font-display text-lg font-semibold text-fg">
              {t("sectionWhen")}
            </h2>
            <div className="flex flex-col gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === "now"}
                  onChange={() => setSendMode("now")}
                />
                {t("sendNow")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === "schedule"}
                  onChange={() => setSendMode("schedule")}
                />
                {t("sendSchedule")}
              </label>
            </div>
            {sendMode === "schedule" ? (
              <label className="ds-label">
                {t("scheduleLocal")}
                <input
                  type="datetime-local"
                  min={scheduleMin}
                  value={scheduleLocal}
                  onChange={(e) => setScheduleLocal(e.target.value)}
                  className="ds-input"
                />
                <p className="mt-1 text-xs text-fg-muted">{t("scheduleSystemHint")}</p>
              </label>
            ) : null}
          </section>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="ds-btn-primary"
              disabled={submitBusy || initialLists.length === 0}
              onClick={() => {
                setFormError(null);
                const err =
                  !name.trim()
                    ? t("errorNameRequired")
                    : listId === ""
                      ? t("errorListRequired")
                      : !templateKey
                        ? t("noTemplateSelected")
                        : validateSchedule();
                if (err) {
                  setFormError(err);
                  return;
                }
                if (recipientCount === 0) {
                  setFormError(t("errorEmptyList"));
                  return;
                }
                setReviewOpen(true);
              }}
            >
              {t("openReview")}
            </button>
          </div>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-2xl border border-border-strong bg-[#e8ebe0] shadow-lg ring-1 ring-black/5">
            <WhatsAppTemplatePhonePreview
              model={previewModel}
              businessName={selectedTemplate?.name ?? "my-wati"}
            />
          </div>
          <CostBlock
            category={pricingCategory}
            recipients={recipientCount}
            usdRate={usdBrl}
          />
        </div>
      </div>

      {reviewOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-fg/40 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-title"
        >
          <div className="max-h-[min(90dvh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 id="review-title" className="font-display text-xl font-bold text-fg">
              {t("reviewTitle")}
            </h2>
            <ul className="mt-4 space-y-2 text-sm text-fg-secondary">
              <li>
                <span className="font-medium text-fg">{t("name")}:</span> {name.trim()}
              </li>
              <li>
                <span className="font-medium text-fg">{t("list")}:</span>{" "}
                {selectedList?.name ?? "—"}
              </li>
              <li>
                <span className="font-medium text-fg">{t("reviewRecipients")}:</span>{" "}
                {recipientCount}
              </li>
              <li>
                <span className="font-medium text-fg">{t("template")}:</span>{" "}
                {selectedTemplate?.name} · {selectedTemplate?.language}
              </li>
              <li>
                <span className="font-medium text-fg">{t("reviewSendMode")}:</span>{" "}
                {sendMode === "now"
                  ? t("sendNow")
                  : scheduleLocal || "—"}
              </li>
            </ul>
            <div className="mt-4">
              <CostBlock
                category={pricingCategory}
                recipients={recipientCount}
                usdRate={usdBrl}
              />
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="ds-btn-outline"
                disabled={submitBusy}
                onClick={() => setReviewOpen(false)}
              >
                {t("reviewCancel")}
              </button>
              <button
                type="button"
                className="ds-btn-primary"
                disabled={submitBusy}
                onClick={() => void submit()}
              >
                {submitBusy ? t("submitting") : t("reviewConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
