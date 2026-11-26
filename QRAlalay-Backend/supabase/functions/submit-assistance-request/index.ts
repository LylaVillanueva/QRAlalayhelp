import { enforceIpQuota, HttpError, jsonResponse, preflight, readJson, requireAllowedOrigin, requireString, optionalFinite, optionalText, safeError, serviceRpc, sha256Hex } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    await enforceIpQuota(request, "submit-assistance-request", 10, 60);
    const body = await readJson(request, 8_192);
    const token = requireString(body.token, "QR token", /^[A-Za-z0-9_-]{32,64}$/);
    const idempotencyKey = requireString(body.idempotencyKey, "idempotency key", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    // The browser creates and persists this high-entropy capability before
    // sending, so a network retry uses the same ownership credential.
    const requestToken = requireString(body.requestToken, "request credential", /^[A-Za-z0-9_-]{40,64}$/);
    const locationToken = requireString(body.locationToken, "location credential", /^[A-Za-z0-9_-]{40,64}$/);
    const publicNote = optionalText(body.publicNote, "note", 1000);
    const locationDescription = optionalText(body.locationDescription, "location description", 500);
    const latitude = optionalFinite(body.latitude, "latitude", -90, 90);
    const longitude = optionalFinite(body.longitude, "longitude", -180, 180);
    const accuracyMeters = optionalFinite(body.accuracyMeters, "location accuracy", 0, 100_000);
    if ((latitude === null) !== (longitude === null) || (accuracyMeters !== null && latitude === null)) {
      throw new HttpError(400, "INVALID_INPUT", "Location coordinates are incomplete.");
    }
    const tokenHash = await sha256Hex(token);
    const requestTokenHash = await sha256Hex(requestToken);
    const locationTokenHash = await sha256Hex(locationToken);
    const payload = { tokenHash, publicNote, locationDescription, latitude, longitude, accuracyMeters, locationTokenHash };
    const payloadHash = await sha256Hex(JSON.stringify(payload));
    const rows = await serviceRpc("create_public_assistance_request", {
      p_token_hash: tokenHash,
      p_idempotency_key: idempotencyKey,
      p_request_token_hash: requestTokenHash,
      p_location_token_hash: locationTokenHash,
      p_payload_hash: payloadHash,
      p_public_note: publicNote,
      p_latitude: latitude,
      p_longitude: longitude,
      p_accuracy_meters: accuracyMeters,
      p_location_description: locationDescription,
    });
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (!result?.case_id) throw new Error("missing case result");
    return jsonResponse({
      data: {
        status: result.case_status,
        joinedExisting: result.joined_existing,
        cancellableUntil: result.cancellable_until,
        requestToken,
        locationToken,
      },
    }, 200, corsHeaders(request));
  } catch (error) {
    return safeError(error, request);
  }
});

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = (Deno.env.get("PUBLIC_WEB_ORIGINS") ?? "").split(",").map((item) => item.trim());
  return origin && allowed.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}
