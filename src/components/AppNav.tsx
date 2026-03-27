"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  FolderOpen,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Phone,
  Settings,
  Tags,
  User,
  Users,
  Zap,
} from "lucide-react";
import { TenantSelector, type TenantOption } from "@/components/TenantSelector";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

type Props = {
  isAdmin: boolean;
  tenants: TenantOption[];
  currentTenantId: string;
  onNavigate?: () => void;
};

export function AppNav({
  isAdmin,
  tenants,
  currentTenantId,
  onNavigate,
}: Props) {
  const t = useTranslations("app.nav");
  const router = useRouter();
  const pathname = usePathname();
  const tenantMatch = pathname.match(/^\/(\d+)(?:\/|$)/);
  const tenantId = tenantMatch?.[1] ?? currentTenantId;
  const base = `/${tenantId}`;

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
    onNavigate?.();
  }

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: t("sectionMain"),
      items: [
        {
          href: `${base}/dashboard`,
          label: t("dashboard"),
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: t("sectionMessaging"),
      items: [
        { href: `${base}/contacts`, label: t("contacts"), icon: Phone },
        { href: `${base}/tags`, label: t("tags"), icon: Tags },
        { href: `${base}/lists`, label: t("lists"), icon: FolderOpen },
        {
          href: `${base}/templates`,
          label: t("templates"),
          icon: MessageSquare,
        },
        { href: `${base}/campaigns`, label: t("campaigns"), icon: Zap },
      ],
    },
    {
      title: t("sectionOrg"),
      items: [
        ...(isAdmin
          ? [
              {
                href: `${base}/settings`,
                label: t("settings"),
                icon: Settings,
              } satisfies NavItem,
            ]
          : []),
        { href: `${base}/members`, label: t("members"), icon: Users },
      ],
    },
  ];

  return (
    <div className="flex h-full max-h-screen flex-col px-3 py-5 sm:px-4 lg:py-6">
      <Link
        href={`${base}/dashboard`}
        className="mb-8 flex items-center gap-3 px-2 no-underline lg:mb-10"
        onClick={onNavigate}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-whatsapp text-white shadow-md">
          <MessageSquare className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="font-display text-lg font-bold tracking-tight text-fg">
          my-wati
        </span>
      </Link>

      <TenantSelector
        tenants={tenants}
        currentTenantId={currentTenantId}
        onNavigate={onNavigate}
      />

      <nav className="flex flex-1 flex-col gap-0 overflow-y-auto overscroll-contain pb-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-2 last:mb-0">
            <p className="ds-nav-section">{section.title}</p>
            <ul className="space-y-1.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-out ${
                        active
                          ? "bg-primary-50 text-primary-600 shadow-sm ring-1 ring-primary-100"
                          : "text-fg-secondary hover:bg-neutral-50 hover:text-fg"
                      }`}
                    >
                      <Icon
                        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-primary-600" : "text-fg-muted"}`}
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto shrink-0 space-y-1 border-t border-border pt-5">
        <Link
          href={`${base}/profile`}
          onClick={onNavigate}
          className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-out ${
            pathname === `${base}/profile`
              ? "bg-primary-50 text-primary-600 shadow-sm ring-1 ring-primary-100"
              : "text-fg-secondary hover:bg-neutral-50 hover:text-fg"
          }`}
        >
          <User
            className={`h-[18px] w-[18px] shrink-0 ${pathname === `${base}/profile` ? "text-primary-600" : "text-fg-muted"}`}
            strokeWidth={1.5}
            aria-hidden
          />
          {t("profile")}
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="ds-btn-ghost w-full justify-start gap-2 px-3 py-2.5 text-fg-secondary"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
