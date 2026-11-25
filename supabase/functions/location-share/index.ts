import { enforceIpQuota, HttpError, jsonResponse, preflight, readJson, requireAllowedOrigin, requireString, optionalFinite, safeError, serviceRpc, sha256Hex } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    await enforceIpQuota(request, "location-share", 24, 60);
    const body = await readJson(request, 2_048);
    const action = requireString(body.action, "location action", /^(start|update|stop)$/);
    const token = requireString(body.locationToken, "location credential", /^[A-Za-z0-9_-]{40,64}$/);
    const tokenHash = await sha256Hex(token);
    let sharing = false;
    if (action === "start") {
      sharing = await serviceRpc("start_public_location_share", { p_location_token_hash: tokenHash }) === true;
    } else if (action === "stop") {
      await serviceRpc("stop_public_location_share", { p_location_token_hash: tokenHash });
    } else {
      const latitude = optionalFinite(body.latitude, "latitude", -90, 90);
      const longitude = optionalFinite(body.longitude, "longitude", -180, 180);
      const accuracyMeters = optionalFinite(body.accuracyMeters, "location accuracy", 0, 100_000);
      if (latitude === null || longitude === null) throw new HttpError(400, "INVALID_INPUT", "Location coordinates are required.");
      sharing = await serviceRpc("update_public_location_share", {
        p_location_token_hash: tokenHash,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_meters: accuracyMeters,
      }) === true;
    }
    return jsonResponse({ data: { ok: true, sharing } }, 200, corsHeaders(request));
  } catch (error) {
    return safeError(error, request);
  }
});

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = (Deno.env.get("PUBLIC_WEB_ORIGINS") ?? "").split(",").map((item) => item.trim());
  return origin && allowed.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}
