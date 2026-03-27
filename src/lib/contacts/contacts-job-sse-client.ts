export type ContactsJobSseOutcome =
  | { kind: "completed"; result: unknown }
  | { kind: "failed"; reason: string | null }
  | { kind: "timeout" };

/**
 * Acompanha um job de import/bulk via SSE até estado terminal.
 * Usa `EventSource` (cookies de sessão no mesmo site).
 */
export function awaitContactsJobSse(options: {
  url: string;
  statusErrorMessage: string;
}): Promise<ContactsJobSseOutcome> {
  return new Promise((resolve) => {
    const es = new EventSource(options.url, { withCredentials: true });
    let settled = false;

    const finish = (outcome: ContactsJobSseOutcome) => {
      if (settled) return;
      settled = true;
      es.close();
      resolve(outcome);
    };

    es.onmessage = (ev) => {
      let j: {
        state: string;
        failedReason?: string | null;
        result?: unknown;
      };
      try {
        j = JSON.parse(ev.data) as typeof j;
      } catch {
        return;
      }
      if (j.state === "completed") {
        finish({ kind: "completed", result: j.result ?? null });
        return;
      }
      if (j.state === "failed") {
        finish({ kind: "failed", reason: j.failedReason ?? null });
        return;
      }
      if (j.state === "timeout") {
        finish({ kind: "timeout" });
        return;
      }
      if (j.state === "not_found") {
        finish({ kind: "failed", reason: options.statusErrorMessage });
      }
    };

    es.onerror = () => {
      finish({ kind: "failed", reason: options.statusErrorMessage });
    };
  });
}
