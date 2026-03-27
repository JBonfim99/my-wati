"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export function AutoSetTenant({ tenantId }: { tenantId: number }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${tenantId}/dashboard`);
  }, [tenantId, router]);

  return (
    <p className="text-sm text-fg-muted" role="status">
      A abrir…
    </p>
  );
}
