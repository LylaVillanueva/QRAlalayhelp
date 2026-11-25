import { enforceIpQuota, HttpError, jsonResponse, preflight, readJson, requireAllowedOrigin, requireString, safeError, serviceRpc, sha256Hex } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    await enforceIpQuota(request, "public-qr-view", 90, 60);
    const body = await readJson(request, 2_048);
    const token = requireString(body.token, "QR token", /^[A-Za-z0-9_-]{32,64}$/);
    const result = await serviceRpc("get_public_qr_view", { p_token_hash: await sha256Hex(token) });
    if (!result?.active) throw new HttpError(404, "QR_NOT_ACTIVE", "This QR code is not available.");
    return jsonResponse({ data: result }, 200, { ...cors(request) });
  } catch (error) {
    return safeError(error, request);
  }
});

function cors(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const allowed = (Deno.env.get("PUBLIC_WEB_ORIGINS") ?? "").split(",").map((item) => item.trim());
  return allowed.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}
