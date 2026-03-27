"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const t = useTranslations("app.login");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/select-tenant`,
      },
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="ds-auth-shell flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-whatsapp text-white shadow-lg">
          <MessageSquare className="h-7 w-7" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="font-display text-2xl font-bold tracking-tight text-fg">
          my-wati
        </span>
      </div>
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="ds-card w-full max-w-md space-y-5 p-8"
      >
        <div>
          <h1 className="ds-section-title">{t("title")}</h1>
          <p className="ds-subtitle mt-1">{t("subtitle")}</p>
        </div>
        {sent ? (
          <p className="rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-green-900">
            {t("checkEmail")}
          </p>
        ) : (
          <>
            <label className="ds-label">
              {t("email")}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ds-input"
                autoComplete="email"
              />
            </label>
            {err ? <p className="text-sm text-danger">{err}</p> : null}
            <button type="submit" className="ds-btn-primary w-full">
              {t("sendLink")}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
