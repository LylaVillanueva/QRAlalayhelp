import { enforceIpQuota, HttpError, jsonResponse, preflight, readJson, requireAllowedOrigin, requireString, safeError, serviceRpc, sha256Hex } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    await enforceIpQuota(request, "cancel-assistance-request", 20, 60);
    const body = await readJson(request, 2_048);
    const requestToken = requireString(body.requestToken, "request credential", /^[A-Za-z0-9_-]{40,64}$/);
    const cancelled = await serviceRpc("cancel_public_assistance_request", {
      p_request_token_hash: await sha256Hex(requestToken),
    });
    return jsonResponse({ data: { cancelled: cancelled === true } }, 200, corsHeaders(request));
  } catch (error) {
    return safeError(error, request);
  }
});

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = (Deno.env.get("PUBLIC_WEB_ORIGINS") ?? "").split(",").map((item) => item.trim());
  return origin && allowed.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}
