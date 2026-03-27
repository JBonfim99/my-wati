"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UserRound } from "lucide-react";

export default function ProfileHub() {
  const t = useTranslations("app.profile");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const j = (await res.json()) as {
        displayName: string | null;
        email: string;
      };
      setDisplayName(j.displayName ?? "");
      setEmail(j.email);
      setLoading(false);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      setMsg({ type: "err", text: j.error ?? t("saveError") });
      return;
    }
    const j = (await res.json()) as { displayName: string | null; email: string };
    setDisplayName(j.displayName ?? "");
    setEmail(j.email);
    setMsg({ type: "ok", text: t("saved") });
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <p className="text-sm text-fg-muted">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-md sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 0% 0%, rgb(99 102 241 / 0.12), transparent 55%)",
          }}
        />
        <div className="relative flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg">
            <UserRound className="h-7 w-7" strokeWidth={1.5} aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-fg-secondary">{t("subtitle")}</p>
          </div>
        </div>
      </header>

      <form onSubmit={(e) => void save(e)} className="ds-card space-y-5 p-6">
        <label className="ds-label">
          {t("displayName")}
          <input
            className="ds-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("displayNamePlaceholder")}
            autoComplete="name"
          />
        </label>
        <div>
          <span className="ds-label">{t("email")}</span>
          <p className="mt-1.5 rounded-lg border border-border bg-neutral-50 px-3 py-2.5 text-sm text-fg-secondary">
            {email || "—"}
          </p>
          <p className="mt-1.5 text-xs text-fg-muted">{t("emailReadonly")}</p>
        </div>
        {msg ? (
          <p
            className={
              msg.type === "ok"
                ? "text-sm font-medium text-success"
                : "text-sm text-danger"
            }
            role="status"
          >
            {msg.text}
          </p>
        ) : null}
        <button type="submit" className="ds-btn-primary w-full" disabled={saving}>
          {saving ? t("saving") : t("save")}
        </button>
      </form>
    </div>
  );
}
