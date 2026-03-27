const DEFAULT_VERSION = "v21.0";

export type PhoneNumberInfoResult =
  | {
      ok: true;
      id: string;
      displayPhoneNumber?: string;
      verifiedName?: string;
    }
  | { ok: false; error: string; errorCode?: number };

/**
 * GET /{phone-number-id} — valida token + ID (útil para “testar integração”).
 * @see https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account-to-number-current-status/
 */
export async function fetchWhatsappPhoneNumberInfo(
  accessToken: string,
  phoneNumberId: string,
  graphVersion: string = DEFAULT_VERSION,
): Promise<PhoneNumberInfoResult> {
  const fields = "id,display_phone_number,verified_name";
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=${encodeURIComponent(fields)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    error?: { message: string; code?: number };
  };
  if (!res.ok || json.error) {
    return {
      ok: false,
      error: json.error?.message ?? res.statusText,
      errorCode: json.error?.code,
    };
  }
  return {
    ok: true,
    id: json.id ?? phoneNumberId,
    displayPhoneNumber: json.display_phone_number,
    verifiedName: json.verified_name,
  };
}

/** Formato esperado pela Cloud API, ex.: `pt_BR`, `en_US` (não use hífen). */
export function normalizeWhatsappLanguageCode(raw: string): string {
  const s = raw.trim().replace(/-/g, "_");
  if (!s) return s;
  const parts = s.split("_").filter(Boolean);
  if (parts.length === 1) return parts[0]!.toLowerCase();
  const lang = parts[0]!.toLowerCase();
  const rest = parts.slice(1).map((p) => p.toUpperCase()).join("_");
  return `${lang}_${rest}`;
}

export type SendTemplatePayload = {
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
};

export type SendTemplateResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; errorCode?: number };

export async function sendTemplateMessage(
  accessToken: string,
  phoneNumberId: string,
  body: SendTemplatePayload,
  graphVersion: string = DEFAULT_VERSION,
): Promise<SendTemplateResult> {
  const templateName = body.templateName.trim().toLowerCase();
  const languageCode = normalizeWhatsappLanguageCode(body.languageCode);

  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: body.to.replace(/\D/g, ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(body.components?.length
          ? { components: body.components }
          : {}),
      },
    }),
  });
  const json = (await res.json()) as {
    messages?: { id: string }[];
    error?: { message: string; code?: number; error_subcode?: number };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: json.error?.message ?? res.statusText,
      errorCode: json.error?.code,
    };
  }
  const id = json.messages?.[0]?.id;
  if (!id) return { ok: false, error: "No message id in response" };
  return { ok: true, messageId: id };
}

/** Campos devolvidos pelo GET /{WABA_ID}/message_templates (ver [Templates overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)). */
export type MessageTemplateRecord = {
  id?: string;
  name?: string;
  parameter_format?: string;
  status?: string;
  category?: string;
  sub_category?: string;
  language?: string;
  components?: unknown[];
  previous_category?: string;
  rejected_reason?: { message?: string } | string;
  message_send_ttl_seconds?: number;
};

const TEMPLATE_LIST_FIELDS = [
  "id",
  "name",
  "parameter_format",
  "status",
  "category",
  "sub_category",
  "language",
  "components",
  "previous_category",
  "rejected_reason",
  "message_send_ttl_seconds",
].join(",");

/**
 * Lista todos os message templates do WABA, seguindo `paging.next` até acabar.
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
 */
export async function listMessageTemplatesFromWaba(
  accessToken: string,
  businessAccountId: string,
  graphVersion: string = DEFAULT_VERSION,
): Promise<MessageTemplateRecord[]> {
  const base = `https://graph.facebook.com/${graphVersion}/${businessAccountId}/message_templates`;
  const firstUrl = `${base}?fields=${encodeURIComponent(TEMPLATE_LIST_FIELDS)}&limit=100`;

  const all: MessageTemplateRecord[] = [];
  let url: string | null = firstUrl;
  let isFirst = true;

  while (url) {
    const res = await fetch(url, {
      headers: isFirst
        ? { Authorization: `Bearer ${accessToken}` }
        : {},
    });
    isFirst = false;

    const json = (await res.json()) as {
      data?: MessageTemplateRecord[];
      paging?: { next?: string };
      error?: { message: string };
    };

    if (!res.ok || json.error) {
      throw new Error(json.error?.message ?? res.statusText ?? "Failed to list templates");
    }

    all.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }

  return all;
}
