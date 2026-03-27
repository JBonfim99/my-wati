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

export type PhoneNumberHealthData = {
  id: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  /** Qualidade do número (Meta): GREEN | YELLOW | RED | … */
  qualityRating?: string;
  /** Limite / escalonamento (ex.: tier, throughput). */
  messagingLimitTier?: string;
  /** Campo atual na Graph API (substitui gradualmente `messaging_limit_tier`). */
  whatsappBusinessManagerMessagingLimit?: string;
  throughput?: unknown;
};

export type PhoneNumberHealthResult =
  | { ok: true; data: PhoneNumberHealthData }
  | { ok: false; error: string; errorCode?: number };

/**
 * GET /{phone-number-id} — campos extra para painel (qualidade do número, tier, throughput).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers
 */
export async function fetchWhatsappPhoneNumberHealth(
  accessToken: string,
  phoneNumberId: string,
  graphVersion: string = DEFAULT_VERSION,
): Promise<PhoneNumberHealthResult> {
  const tryFields = [
    "id,display_phone_number,verified_name,quality_rating,throughput,messaging_limit_tier,whatsapp_business_manager_messaging_limit",
    "id,display_phone_number,verified_name,quality_rating,throughput,messaging_limit_tier",
    "id,display_phone_number,verified_name,quality_rating,throughput",
    "id,display_phone_number,verified_name,quality_rating",
    "id,display_phone_number,verified_name",
  ];

  for (const fields of tryFields) {
    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=${encodeURIComponent(fields)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      throughput?: unknown;
      messaging_limit_tier?: string;
      whatsapp_business_manager_messaging_limit?: string;
      error?: { message: string; code?: number };
    };
    if (!res.ok || json.error) {
      const code = json.error?.code;
      const msg = json.error?.message ?? "";
      if (code === 190 || code === 102) {
        return {
          ok: false,
          error: msg || res.statusText,
          errorCode: code,
        };
      }
      const maybeFieldError =
        code === 100 || /invalid|field|unknown/i.test(msg);
      if (maybeFieldError && fields !== tryFields[tryFields.length - 1]!) {
        continue;
      }
      return {
        ok: false,
        error: msg || res.statusText,
        errorCode: code,
      };
    }
    return {
      ok: true,
      data: {
        id: json.id ?? phoneNumberId,
        displayPhoneNumber: json.display_phone_number,
        verifiedName: json.verified_name,
        qualityRating: json.quality_rating,
        messagingLimitTier: json.messaging_limit_tier,
        whatsappBusinessManagerMessagingLimit:
          json.whatsapp_business_manager_messaging_limit,
        throughput: json.throughput,
      },
    };
  }

  return {
    ok: false,
    error: "Não foi possível obter dados do número na Graph API.",
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
  /**
   * Só o formato de **envio** Cloud API: `{ type: "body"|"header"|…", parameters: [...] }`.
   * Nunca reutilizar o JSON de GET /message_templates (tem `text`, `format`, etc.).
   */
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
  /** Unix timestamp (segundos), se a Meta devolver na listagem */
  last_updated_time?: string;
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

const TEMPLATE_GET_FIELDS = [
  "id",
  "name",
  "parameter_format",
  "status",
  "category",
  "sub_category",
  "language",
  "components",
  "rejected_reason",
  "message_send_ttl_seconds",
].join(",");

function readGraphError(json: { error?: { message?: string } }): string {
  return json.error?.message ?? "Graph API error";
}

/**
 * GET /{message_template_id} — detalhe de um template (HSM).
 */
export async function fetchMessageTemplateById(
  accessToken: string,
  templateId: string,
  graphVersion: string = DEFAULT_VERSION,
): Promise<MessageTemplateRecord> {
  const id = templateId.trim();
  const url = `https://graph.facebook.com/${graphVersion}/${id}?fields=${encodeURIComponent(TEMPLATE_GET_FIELDS)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as MessageTemplateRecord & {
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    throw new Error(readGraphError(json));
  }
  return json;
}

export type CreateTemplateResult =
  | { ok: true; id: string; status?: string; category?: string }
  | { ok: false; error: string; errorCode?: number };

/**
 * POST /{WABA_ID}/message_templates
 */
export async function createMessageTemplateOnWaba(
  accessToken: string,
  businessAccountId: string,
  body: {
    name: string;
    language: string;
    category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
    components: unknown[];
    allow_category_change?: boolean;
    parameter_format?: string;
  },
  graphVersion: string = DEFAULT_VERSION,
): Promise<CreateTemplateResult> {
  const waba = businessAccountId.trim();
  const url = `https://graph.facebook.com/${graphVersion}/${waba}/message_templates`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: body.name.trim().toLowerCase(),
      language: body.language.trim(),
      category: body.category,
      components: body.components,
      ...(body.allow_category_change !== undefined
        ? { allow_category_change: body.allow_category_change }
        : { allow_category_change: true }),
      ...(body.parameter_format?.trim()
        ? { parameter_format: body.parameter_format.trim() }
        : {}),
    }),
  });
  const json = (await res.json()) as {
    id?: string;
    status?: string;
    category?: string;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || json.error) {
    return {
      ok: false,
      error: readGraphError(json),
      errorCode: json.error?.code,
    };
  }
  if (!json.id) return { ok: false, error: "Resposta sem id do template" };
  return {
    ok: true,
    id: json.id,
    status: json.status,
    category: json.category,
  };
}

export type SimpleMutationResult =
  | { ok: true }
  | { ok: false; error: string; errorCode?: number };

/**
 * DELETE /{WABA_ID}/message_templates?hsm_id={id}
 */
export async function deleteMessageTemplateFromWaba(
  accessToken: string,
  businessAccountId: string,
  hsmId: string,
  graphVersion: string = DEFAULT_VERSION,
): Promise<SimpleMutationResult> {
  const waba = businessAccountId.trim();
  const hsm = hsmId.trim();
  const q = new URLSearchParams({ hsm_id: hsm });
  const url = `https://graph.facebook.com/${graphVersion}/${waba}/message_templates?${q}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    success?: boolean;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || json.error) {
    return {
      ok: false,
      error: readGraphError(json),
      errorCode: json.error?.code,
    };
  }
  if (json.success === false) {
    return { ok: false, error: "Falha ao excluir template" };
  }
  return { ok: true };
}

export type UpdateTemplateResult =
  | { ok: true; id?: string; name?: string; category?: string }
  | { ok: false; error: string; errorCode?: number };

/**
 * POST /{message_template_id} — atualiza template (ex.: rascunho).
 */
export async function updateMessageTemplateById(
  accessToken: string,
  templateId: string,
  body: {
    components: unknown[];
    category?: "UTILITY" | "MARKETING" | "AUTHENTICATION";
    parameter_format?: string;
  },
  graphVersion: string = DEFAULT_VERSION,
): Promise<UpdateTemplateResult> {
  const id = templateId.trim();
  const url = `https://graph.facebook.com/${graphVersion}/${id}`;
  const payload: Record<string, unknown> = {
    components: body.components,
  };
  if (body.category) payload.category = body.category;
  if (body.parameter_format?.trim()) {
    payload.parameter_format = body.parameter_format.trim();
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as {
    success?: boolean;
    id?: string;
    name?: string;
    category?: string;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || json.error) {
    return {
      ok: false,
      error: readGraphError(json),
      errorCode: json.error?.code,
    };
  }
  return {
    ok: true,
    id: json.id,
    name: json.name,
    category: json.category,
  };
}

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

/**
 * Lista templates do WABA filtrando por nome (e opcionalmente idioma).
 * @see https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/
 */
export async function listMessageTemplatesFromWabaFiltered(
  accessToken: string,
  businessAccountId: string,
  filters: { name: string; language?: string },
  graphVersion: string = DEFAULT_VERSION,
): Promise<MessageTemplateRecord[]> {
  const waba = businessAccountId.trim();
  const base = `https://graph.facebook.com/${graphVersion}/${waba}/message_templates`;
  const q = new URLSearchParams();
  q.set("fields", TEMPLATE_LIST_FIELDS);
  q.set("limit", "50");
  q.set("name", filters.name.trim());
  const lang = filters.language?.trim();
  if (lang) q.set("language", lang);

  const all: MessageTemplateRecord[] = [];
  let url: string | null = `${base}?${q}`;
  let isFirst = true;

  while (url) {
    const res = await fetch(url, {
      headers: isFirst ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    isFirst = false;

    const json = (await res.json()) as {
      data?: MessageTemplateRecord[];
      paging?: { next?: string };
      error?: { message: string };
    };

    if (!res.ok || json.error) {
      throw new Error(
        json.error?.message ?? res.statusText ?? "Failed to list templates",
      );
    }

    all.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }

  return all;
}
