import type { ContactsQueueJobStatusJson } from "@/lib/queues/contacts-job-status";

const encoder = new TextEncoder();

export const CONTACTS_IMPORT_JOB_SSE_MAX_MS = 300_000;
export const CONTACTS_BULK_JOB_SSE_MAX_MS = 180_000;

const HEARTBEAT_MS = 20_000;
const INITIAL_POLL_MS = 1200;
const MAX_POLL_MS = 5000;

function encodeSseData(data: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function encodeSseComment(): Uint8Array {
  return encoder.encode(`: ping\n\n`);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export type ContactsJobSseExtraPayload =
  | { state: "timeout" }
  | { state: "not_found" };

/**
 * SSE com poll interno ao Redis/BullMQ (variante A do plano).
 * Envia `retry` alto no início para evitar reconexões agressivas do EventSource.
 */
export function createContactsQueueJobSseStream(options: {
  signal: AbortSignal;
  maxMs: number;
  poll: () => Promise<ContactsQueueJobStatusJson | null>;
}): ReadableStream<Uint8Array> {
  const { signal, maxMs, poll } = options;
  const deadline = Date.now() + maxMs;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(`retry: ${864000000}\n\n`),
        );

        let backoffMs = INITIAL_POLL_MS;
        let lastPayloadJson = "";
        let lastHeartbeatAt = Date.now();

        while (!signal.aborted && Date.now() < deadline) {
          if (Date.now() - lastHeartbeatAt >= HEARTBEAT_MS) {
            controller.enqueue(encodeSseComment());
            lastHeartbeatAt = Date.now();
          }

          const body = await poll();
          if (body === null) {
            controller.enqueue(
              encodeSseData({ state: "not_found" } satisfies ContactsJobSseExtraPayload),
            );
            break;
          }

          const json = JSON.stringify(body);
          if (json !== lastPayloadJson) {
            lastPayloadJson = json;
            controller.enqueue(encodeSseData(body));
            lastHeartbeatAt = Date.now();
          }

          if (body.state === "completed" || body.state === "failed") {
            break;
          }

          const waitMs = Math.min(backoffMs, HEARTBEAT_MS);
          backoffMs = Math.min(MAX_POLL_MS, Math.round(backoffMs * 1.5));
          try {
            await sleep(waitMs, signal);
          } catch {
            break;
          }
        }

        if (!signal.aborted && Date.now() >= deadline) {
          const last = lastPayloadJson
            ? (JSON.parse(lastPayloadJson) as ContactsQueueJobStatusJson)
            : null;
          if (
            !last ||
            (last.state !== "completed" && last.state !== "failed")
          ) {
            controller.enqueue(
              encodeSseData({ state: "timeout" } satisfies ContactsJobSseExtraPayload),
            );
          }
        }
      } catch {
        // AbortError ou falha inesperada: encerra sem payload extra
      } finally {
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    },
  });
}

export function contactsQueueJobSseResponse(
  stream: ReadableStream<Uint8Array>,
): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
