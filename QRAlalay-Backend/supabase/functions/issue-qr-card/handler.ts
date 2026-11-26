import { authenticatedRpc, HttpError, jsonResponse, preflight, randomToken, readJson, requireAllowedOrigin, requireString, safeError, sha256Hex } from "../_shared/http.ts";
import { encryptQrToken } from "../_shared/qr-token-crypto.ts";

export async function handleIssueQrCard(request: Request) {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    const body = await readJson(request, 2_048);
    const residentId = requireString(body.residentId, "resident id", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const siteOrigin = Deno.env.get("PUBLIC_SITE_ORIGIN")?.replace(/\/$/, "");
    if (!siteOrigin || !/^https:\/\//i.test(siteOrigin)) throw new Error("invalid public site origin configuration");

    const cardId = crypto.randomUUID();
    const token = randomToken(32);
    const encryptedToken = await encryptQrToken(cardId, residentId, token);
    const issuedCardId = await authenticatedRpc(request, "issue_qr_card_secure", {
      p_card_id: cardId,
      p_resident_id: residentId,
      p_token_hash: await sha256Hex(token),
      p_encrypted_token: encryptedToken,
    });
    if (issuedCardId !== cardId) throw new Error("QR card persistence did not match the issued card");
    return jsonResponse({ data: { cardId, token, publicUrl: `${siteOrigin}/scan/${encodeURIComponent(token)}` } }, 201, corsHeaders(request));
  } catch (error) {
    return safeError(error, request);
  }
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = (Deno.env.get("PUBLIC_WEB_ORIGINS") ?? "").split(",").map((item) => item.trim());
  return origin && allowed.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}
