import { authenticatedRpc, HttpError, jsonResponse, preflight, readJson, requireAllowedOrigin, requireString, safeError, serviceRpc } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight(request);
  try {
    requireAllowedOrigin(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    const body = await readJson(request, 2_048);
    const emailInput = body.email;
    const email = emailInput === undefined || emailInput === null || emailInput === ""
      ? null
      : requireString(emailInput, "email", /^[^\s@]{1,128}@[^\s@]{1,190}$/).trim().toLowerCase();
    const fullName = requireString(body.fullName, "full name").trim();
    const phone = body.phone === undefined || body.phone === null ? null : requireString(body.phone, "phone").trim();
    if (!email && !phone) throw new HttpError(400, "INVALID_INPUT", "Provide an email address or phone number.");
    if (!email && phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) throw new HttpError(400, "INVALID_INPUT", "Phone-only invitations require an E.164 phone number.");
    const role = requireString(body.role, "role", /^(official|guardian|responder|resident)$/);
    const position = body.position === undefined || body.position === null ? null : requireString(body.position, "position").trim();
    const homeAddress = body.homeAddress === undefined || body.homeAddress === null ? null : requireString(body.homeAddress, "address").trim();
    if (!fullName || fullName.length > 200 || (phone && phone.length > 40)
      || (position && position.length > 100) || (homeAddress && homeAddress.length > 300)) {
      throw new HttpError(400, "INVALID_INPUT", "Invalid account details.");
    }
    const wardIds = body.wardIds === undefined ? [] : body.wardIds;
    const relationship = body.relationship === undefined ? null : requireString(body.relationship, "relationship").trim();
    if (!Array.isArray(wardIds) || wardIds.length > 25 || wardIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      throw new HttpError(400, "INVALID_INPUT", "Invalid resident relationships.");
    }
    if (wardIds.length && (role !== "guardian" || !relationship || relationship.length > 100)) throw new HttpError(400, "INVALID_INPUT", "Guardian relationship details are required.");

    // The database function authorizes the signed-in active official, scopes
    // the invitation to that official's barangay, and records its audit entry.
    const profileId = email
      ? await authenticatedRpc(request, "create_profile_invitation_with_work_info", {
        p_email: email, p_full_name: fullName, p_phone: phone, p_role: role,
        p_ward_ids: [...new Set(wardIds)], p_relationship: relationship,
        p_position: position, p_home_address: homeAddress,
      })
      : await authenticatedRpc(request, "create_profile_phone_invitation_with_work_info", {
        p_phone: phone, p_full_name: fullName, p_role: role,
        p_ward_ids: [...new Set(wardIds)], p_relationship: relationship,
        p_position: position, p_home_address: homeAddress,
      });

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
    if (!serviceKey || !supabaseUrl) throw new Error("missing auth admin configuration");
    if (!email) {
      // Create an unconfirmed phone identity only. The user must initiate and
      // verify an OTP before claim_phone_invitation can link this Auth user.
      const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
        body: JSON.stringify({ phone, phone_confirm: false, user_metadata: { qralalay_profile_id: profileId } }),
        signal: AbortSignal.timeout(12_000),
      });
      const authUser = await response.json().catch(() => null);
      const authPhone = typeof authUser?.phone === "string" ? authUser.phone.replace(/^\+/, "") : null;
      if (!response.ok || typeof authUser?.id !== "string" || authPhone !== phone.replace(/^\+/, "")) {
        const existingUser = response.status === 409 || response.status === 422
          ? await serviceRpc("phone_auth_user_exists", { p_phone: phone })
          : false;
        if (existingUser !== true) {
          throw new HttpError(response.status === 429 ? 429 : 502, "PHONE_ACCOUNT_SETUP_FAILED", "The phone account could not be prepared. The profile remains inactive.");
        }
      }
      return jsonResponse({ data: { profileId, invitationSent: false, phoneVerificationRequired: true } }, 201);
    }

    const redirectTo = Deno.env.get("AUTH_INVITE_REDIRECT_URL");
    const inviteUrl = `${supabaseUrl}/auth/v1/invite${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""}`;
    const response = await fetch(inviteUrl, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({ email, data: { qralalay_profile_id: profileId } }),
      signal: AbortSignal.timeout(12_000),
    });
    const authUser = await response.json().catch(() => null);
    if (!response.ok || typeof authUser?.id !== "string" || typeof authUser?.email !== "string") {
      // Return a generic response. The pending profile remains inactive and
      // can safely be retried by an official after resolving the Auth issue.
      throw new HttpError(response.status === 429 ? 429 : 502, "INVITATION_DELIVERY_FAILED", "The invitation could not be sent. The pending profile is inactive.");
    }
    await serviceRpc("link_invited_auth_user", {
      p_profile_id: profileId, p_auth_user_id: authUser.id, p_email: authUser.email,
    });
    return jsonResponse({ data: { profileId, invitationSent: true } }, 201);
  } catch (error) {
    return safeError(error, request);
  }
});
