"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AppNav } from "@/components/AppNav";
import type { TenantOption } from "@/components/TenantSelector";
import { Menu, X } from "lucide-react";

type Props = {
  children: React.ReactNode;
  isAdmin: boolean;
  tenantNav: { tenants: TenantOption[]; current: TenantOption | null };
  currentTenantId: string;
};

export function AppShell({
  children,
  isAdmin,
  tenantNav,
  currentTenantId,
}: Props) {
  const [open, setOpen] = useState(false);
  const tShell = useTranslations("app.shell");

  return (
    <div className="flex min-h-screen flex-col bg-page lg:flex-row">
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-sidebar px-4 shadow-sm lg:hidden">
        <span className="font-display text-base font-bold tracking-tight text-fg">
          my-wati
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-fg transition-colors hover:bg-neutral-50"
          aria-expanded={open}
          aria-controls="app-drawer-nav"
          aria-label={open ? tShell("closeMenu") : tShell("openMenu")}
        >
          {open ? (
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </header>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-fg/25 backdrop-blur-[2px] lg:hidden"
          aria-label={tShell("closeMenu")}
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        id="app-drawer-nav"
        className={`fixed inset-y-0 left-0 z-50 w-[min(100%,300px)] max-w-full border-r border-border bg-sidebar shadow-lg transition-transform duration-200 ease-out lg:static lg:z-0 lg:flex lg:h-screen lg:w-[280px] lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <AppNav
          isAdmin={isAdmin}
          tenants={tenantNav.tenants}
          currentTenantId={currentTenantId}
          onNavigate={() => setOpen(false)}
        />
      </aside>

      <main className="min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:min-h-screen lg:px-8 lg:py-10">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
