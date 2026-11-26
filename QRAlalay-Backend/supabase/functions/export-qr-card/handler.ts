import { authenticatedRpc, HttpError, jsonResponse, preflight, readJson, requireAllowedOrigin, requireString, safeError, sha256Hex } from "../_shared/http.ts";
import { decryptQrToken } from "../_shared/qr-token-crypto.ts";

export async function handleExportQrCard(request: Request) {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    const body = await readJson(request, 1_024);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if ((body.residentId === undefined) === (body.cardId === undefined)) {
      throw new HttpError(400, "INVALID_INPUT", "Provide exactly one of residentId or cardId.");
    }
    const residentId = body.residentId === undefined
      ? null
      : requireString(body.residentId, "resident id", uuid);
    const siteOrigin = Deno.env.get("PUBLIC_SITE_ORIGIN")?.replace(/\/$/, "");
    if (!siteOrigin || !/^https:\/\//i.test(siteOrigin)) throw new Error("invalid public site origin configuration");

    let cardId: string;
    if (residentId) {
      const activeCards = await authenticatedRpc(request, "get_resident_qr_card", { p_resident_id: residentId });
      if (!Array.isArray(activeCards) || activeCards.length === 0) {
        throw new HttpError(404, "QR_CARD_NOT_FOUND", "The resident has no active QR card.");
      }
      const activeCard = activeCards[0] as Record<string, unknown>;
      if (typeof activeCard.card_id !== "string") throw new Error("invalid active QR card record");
      cardId = activeCard.card_id;
    } else {
      cardId = requireString(body.cardId, "card id", uuid);
    }

    const result = await authenticatedRpc(request, "get_qr_card_for_export", { p_card_id: cardId });
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new HttpError(404, "QR_CARD_NOT_FOUND", "The active QR card was not found.");
    }
    const record = result as Record<string, unknown>;
    if (record.reexportable !== true || typeof record.encryptedToken !== "string") {
      throw new HttpError(409, "QR_EXPORT_UNAVAILABLE", "This QR card predates secure re-export. Keep the existing card; issuing a replacement will revoke it.");
    }
    if (typeof record.cardId !== "string" || typeof record.residentId !== "string" || typeof record.tokenHash !== "string") {
      throw new Error("invalid QR export record");
    }
    const token = await decryptQrToken(record.cardId, record.residentId, record.encryptedToken);
    if (await sha256Hex(token) !== record.tokenHash) throw new Error("QR credential integrity check failed");
    return jsonResponse({ data: { cardId: record.cardId, publicUrl: `${siteOrigin}/scan/${encodeURIComponent(token)}` } }, 200, corsHeaders(request));
  } catch (error) {
    return safeError(error, request);
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = (Deno.env.get("PUBLIC_WEB_ORIGINS") ?? "").split(",").map((item) => item.trim());
  return origin && allowed.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}
