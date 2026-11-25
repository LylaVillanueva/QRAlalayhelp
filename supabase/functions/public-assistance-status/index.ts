import { enforceIpQuota, HttpError, jsonResponse, preflight, readJson, requireAllowedOrigin, requireString, safeError, serviceRpc, sha256Hex } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    await enforceIpQuota(request, "public-assistance-status", 30, 60);
    const body = await readJson(request, 1_024);
    const token = requireString(body.requestToken, "request credential", /^[A-Za-z0-9_-]{40,64}$/);
    const result = await serviceRpc("get_public_assistance_status", { p_request_token_hash: await sha256Hex(token) });
    const row = Array.isArray(result) ? result[0] : result;
    if (!row) throw new HttpError(404, "REQUEST_NOT_FOUND", "Request not found.");
    return jsonResponse({ data: {
      status: row.case_status,
      createdAt: row.case_created_at,
      cancellableUntil: row.cancellable_until,
      cancelled: row.cancelled,
    } });
  } catch (error) {
    return safeError(error, request);
  }
});
