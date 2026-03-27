import type { ContactRowDto } from "./queries";

/**
 * The serialized shape sent to the client over HTTP.
 * Dates are ISO strings; tenantId is included for context but not critical client-side.
 */
export type SerializedContactDto = {
  id: string;
  tenantId: number;
  phoneE164: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; slug: string }[];
  customValues: Record<string, unknown>;
};

/**
 * Single shared serializer for contact rows → HTTP response shape.
 * Import this in API routes instead of defining a local serializeContact.
 */
export function serializeContact(c: ContactRowDto): SerializedContactDto {
  return {
    id: c.id,
    tenantId: c.tenantId,
    phoneE164: c.phoneE164,
    name: c.name,
    email: c.email,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    tags: c.tags,
    customValues: c.customValues,
  };
}

/**
 * Encodes a cursor for paginated contact listings.
 * Format: base64(JSON({ updatedAt, id }))
 */
export function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ updatedAt, id })).toString("base64");
}

/**
 * Decodes a pagination cursor.  Returns null if the cursor is invalid.
 */
export function decodeCursor(
  raw: string,
): { updatedAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8"),
    ) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "updatedAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as { updatedAt: unknown }).updatedAt === "string" &&
      typeof (parsed as { id: unknown }).id === "string"
    ) {
      return parsed as { updatedAt: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}
