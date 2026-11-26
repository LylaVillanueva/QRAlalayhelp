import { authenticatedRpc, HttpError, jsonResponse, preflight, readJson, requireAllowedOrigin, requireString, safeError, serviceRpc } from "../_shared/http.ts";

export async function handleResendGuardianInvitation(request: Request) {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    const body = await readJson(request, 1_024);
    const profileId = requireString(body.profileId, "profile id", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const prepared = await authenticatedRpc(request, "prepare_guardian_invitation_resend", { p_profile_id: profileId }).catch((error) => {
      if (error instanceof HttpError && error.code === "22023") {
        throw new HttpError(429, "RESEND_RATE_LIMITED", error.message);
      }
      throw error;
    });
    const requestRecord = Array.isArray(prepared) ? prepared[0] : null;
    const requestId = requestRecord?.request_id;
    const email = requestRecord?.email;
    const authUserId = requestRecord?.auth_user_id;
    if (typeof requestId !== "string" || typeof email !== "string" || typeof authUserId !== "string") {
      throw new Error("invalid guardian invitation resend request");
    }

    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
    if (!key || !supabaseUrl) throw new Error("missing auth admin configuration");
    const redirectTo = Deno.env.get("AUTH_INVITE_REDIRECT_URL");
    const inviteUrl = `${supabaseUrl}/auth/v1/invite${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""}`;

    let authAccepted = false;
    try {
      const response = await fetch(inviteUrl, {
        method: "POST",
        headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ email, data: { qralalay_profile_id: profileId } }),
        signal: AbortSignal.timeout(12_000),
      });
      const authUser = await response.json().catch(() => null);
      authAccepted = response.ok && authUser?.id === authUserId
        && typeof authUser?.email === "string" && authUser.email.toLowerCase() === email.toLowerCase();
      if (!authAccepted) throw new Error("Auth did not accept the existing guardian invitation resend");
    } catch {
      await serviceRpc("complete_guardian_invitation_resend", {
        p_request_id: requestId, p_profile_id: profileId, p_auth_user_id: authUserId, p_result: "auth_rejected",
      }).catch(() => {});
      throw new HttpError(502, "INVITATION_RESEND_FAILED", "The existing guardian invitation could not be resent. The account was not replaced.");
    }

    await serviceRpc("complete_guardian_invitation_resend", {
      p_request_id: requestId, p_profile_id: profileId, p_auth_user_id: authUserId, p_result: "auth_accepted",
    });
    return jsonResponse({ data: { resent: true } }, 200);
  } catch (error) {
    return safeError(error, request);
  }
}
