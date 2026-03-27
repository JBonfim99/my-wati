"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { AppNav } from "@/components/AppNav";
import { ToastProvider } from "@/components/ToastProvider";
import type { TenantOption } from "@/components/TenantSelector";
import { TenantSwitchOverlay } from "@/components/TenantSwitchOverlay";
import { Menu, X } from "lucide-react";

type Props = {
  children: React.ReactNode;
  isAdmin: boolean;
  tenantNav: { tenants: TenantOption[]; current: TenantOption | null };
  currentTenantId: string;
  whatsappConnected: boolean;
};

export function AppShell({
  children,
  isAdmin,
  tenantNav,
  currentTenantId,
  whatsappConnected,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pendingTenantSwitch, setPendingTenantSwitch] = useState<string | null>(
    null,
  );
  const tShell = useTranslations("app.shell");

  const endTenantSwitch = useCallback(() => {
    setPendingTenantSwitch(null);
  }, []);

  return (
    <ToastProvider>
    <div className="flex min-h-screen flex-col bg-page lg:h-screen lg:flex-row lg:overflow-hidden">
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
          whatsappConnected={whatsappConnected}
          onBeginTenantSwitch={(id) => setPendingTenantSwitch(id)}
          onNavigate={() => setOpen(false)}
        />
      </aside>

      {/* overflow-x: clip evita barra horizontal sem quebrar position:sticky dos filhos (hidden+auto quebram sticky no Chrome). */}
      <main className="min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 overflow-x-clip overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:min-h-0 lg:px-8 lg:py-10">
        <div className="mx-auto min-w-0 max-w-7xl">{children}</div>
      </main>

      <TenantSwitchOverlay
        pendingTenantId={pendingTenantSwitch}
        onDone={endTenantSwitch}
      />
    </div>
    </ToastProvider>
  );
}
