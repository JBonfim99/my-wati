/**
 * Upload reenviável (Graph API) da imagem de exemplo do cabeçalho IMAGE ao criar template.
 * @see https://developers.facebook.com/docs/graph-api/guides/upload
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components#media-header
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

function extFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname;
    const i = p.lastIndexOf(".");
    if (i === -1) return "";
    return p.slice(i + 1).toLowerCase();
  } catch {
    return "";
  }
}

function mimeFromUrlAndHeader(
  contentType: string | null,
  imageUrl: string,
): { file_type: string; file_name: string } | { error: string } {
  const ct = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (ct && ALLOWED_TYPES.has(ct)) {
    const ext = ct === "image/png" ? "png" : "jpg";
    return { file_type: ct, file_name: `header.${ext}` };
  }
  const ext = extFromUrl(imageUrl);
  if (ext === "png") {
    return { file_type: "image/png", file_name: "header.png" };
  }
  if (ext === "jpg" || ext === "jpeg") {
    return { file_type: "image/jpeg", file_name: "header.jpg" };
  }
  if (ct.startsWith("image/")) {
    return {
      error:
        "Formato de imagem não suportado para upload na Meta. Use JPEG ou PNG (HTTPS).",
    };
  }
  return {
    error:
      "Não foi possível detectar o tipo da imagem. Use uma URL direta .jpg, .jpeg ou .png com HTTPS.",
  };
}

function readGraphErr(json: unknown): string {
  const j = json as { error?: { message?: string } };
  return j.error?.message ?? "Erro na API da Meta.";
}

/**
 * Baixa a URL pública (HTTPS), envia via Resumable Upload e devolve o handle para `header_handle`.
 * Requer `META_APP_ID` (ID numérico do app Meta) e token com permissão de upload.
 */
export async function uploadWhatsAppTemplateHeaderImageFromUrl(opts: {
  accessToken: string;
  graphVersion: string;
  appId: string;
  imageUrl: string;
}): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  const { accessToken, graphVersion, appId, imageUrl } = opts;
  const trimmedApp = appId.trim();
  if (!/^\d+$/.test(trimmedApp)) {
    return { ok: false, error: "META_APP_ID inválido (esperado ID numérico do app)." };
  }

  let imgRes: Response;
  try {
    imgRes = await fetch(imageUrl, {
      redirect: "follow",
      headers: { Accept: "image/*" },
    });
  } catch {
    return {
      ok: false,
      error: "Não foi possível baixar a URL da imagem. Verifique se é HTTPS público.",
    };
  }

  if (!imgRes.ok) {
    return {
      ok: false,
      error: `Falha ao baixar a imagem (${imgRes.status}). A Meta precisa acessar a mesma URL.`,
    };
  }

  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length === 0) {
    return { ok: false, error: "A imagem baixada está vazia." };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Imagem muito grande (máx. ${MAX_IMAGE_BYTES / (1024 * 1024)} MB para upload na Meta).`,
    };
  }

  const mime = mimeFromUrlAndHeader(imgRes.headers.get("content-type"), imageUrl);
  if ("error" in mime) {
    return { ok: false, error: mime.error };
  }

  const { file_type, file_name } = mime;
  const v = graphVersion.trim().replace(/^v/i, "v");
  const base = `https://graph.facebook.com/${v}/${trimmedApp}/uploads`;

  const startParams = new URLSearchParams({
    file_name: file_name,
    file_length: String(buf.length),
    file_type: file_type,
    access_token: accessToken,
  });

  const startRes = await fetch(`${base}?${startParams}`, { method: "POST" });
  const startJson = (await startRes.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!startRes.ok || startJson.error || !startJson.id?.trim()) {
    return {
      ok: false,
      error: readGraphErr(startJson) || "Falha ao iniciar upload na Meta.",
    };
  }

  const sessionId = startJson.id.trim();
  const uploadUrl = `https://graph.facebook.com/${v}/${sessionId}`;

  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      file_offset: "0",
    },
    body: new Uint8Array(buf),
  });

  const upJson = (await upRes.json()) as {
    h?: string;
    error?: { message?: string };
  };

  if (!upRes.ok || upJson.error) {
    return {
      ok: false,
      error: readGraphErr(upJson) || "Falha ao enviar bytes da imagem para a Meta.",
    };
  }

  const handle = typeof upJson.h === "string" ? upJson.h.trim() : "";
  if (!handle) {
    return {
      ok: false,
      error: "A Meta não devolveu o handle do upload. Confira META_APP_ID e permissões do token.",
    };
  }

  return { ok: true, handle };
}
