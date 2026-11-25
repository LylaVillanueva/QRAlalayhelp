import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { AppError } from "@/utils/errors";
import { pool } from "@/db/pool";

/**
 * Thin provider abstraction. Swap the bodies of these two functions for
 * real integrations (e.g. Semaphore/Twilio for SMS, Resend/SendGrid for
 * email) — nothing else in the codebase needs to change.
 */

export async function sendSmsOtp(phoneNumber: string, otp: string): Promise<void> {
  // No SMS provider has been implemented yet. Never report success while
  // silently discarding a production OTP; the caller must configure a real
  // provider integration before enabling phone login.
  logger.warn({ channel: "phone", hasProviderKey: Boolean(env.sms.apiKey) }, "otp.delivery_unavailable");
  throw AppError.unavailable("Phone verification is not configured. Use email or contact the system administrator.", "OTP_DELIVERY_UNAVAILABLE");
}

// Resend's dashboard "Templates" feature — id/alias + variables. A
// template request cannot also include html/text (API rejects it), and
// every variable the template references must be supplied.
const SIGNUP_OTP_TEMPLATE_ID = "sign-up-confirmation";

export async function sendEmailOtp(email: string, otp: string): Promise<void> {
  if (!env.email.apiKey) {
    logger.warn({ channel: "email" }, "otp.delivery_unavailable");
    throw AppError.unavailable("Email verification is not configured. Contact the system administrator.", "OTP_DELIVERY_UNAVAILABLE");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.email.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.email.from,
      to: email,
      template: {
        id: SIGNUP_OTP_TEMPLATE_ID,
        variables: { otpCode: otp },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Provider responses can echo recipient details or configuration data.
    logger.error({ status: res.status }, "resend_send_failed");
    throw AppError.internal("Failed to send verification email", "EMAIL_SEND_FAILED");
  }
}

/** Upserts a device's Expo push token — called once per device after the user grants notification permission. */
export async function registerPushToken(
  userId: string,
  deviceId: string,
  pushToken: string,
  platform: string
): Promise<void> {
  await pool.query(
    `insert into push_tokens (user_id, device_id, push_token, platform)
     values ($1, $2, $3, $4)
     on conflict (user_id, device_id)
     do update set push_token = excluded.push_token, platform = excluded.platform, updated_at = now()`,
    [userId, deviceId, pushToken, platform]
  );
}

/** Removes a device's registration — called when a user turns push notifications off. */
export async function unregisterPushToken(userId: string, deviceId: string): Promise<void> {
  await pool.query(`delete from push_tokens where user_id = $1 and device_id = $2`, [userId, deviceId]);
}

/**
 * [8A] Triggers Dynamic Push Notification — guardian alert on incident creation.
 * Sends to every device the user has registered, via Expo's push service —
 * this is intentionally best-effort: a failed push must never fail the
 * incident-lifecycle action that triggered it, so errors are logged, not thrown.
 */
export async function sendPushNotification(userId: string, title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const { rows } = await pool.query<{ push_token: string }>(`select push_token from push_tokens where user_id = $1`, [userId]);
    if (rows.length === 0) {
      logger.info({ userId, title }, "push_notification.no_registered_devices");
      return;
    }

    const messages = rows.map((row) => ({
      to: row.push_token,
      title,
      body,
      data: data ?? {},
      sound: "default",
      priority: "high",
    }));

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(env.expo.pushAccessToken ? { Authorization: `Bearer ${env.expo.pushAccessToken}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Avoid persisting provider error bodies in logs, since integrations
      // can echo sensitive recipient or token data.
      logger.error({ userId, status: res.status }, "push_notification.send_failed");
      return;
    }

    const result = (await res.json().catch(() => null)) as { data?: unknown } | null;
    logger.info({ userId, title, tickets: result?.data }, "push_notification.dispatch");
  } catch (err) {
    logger.error({ err, userId, title }, "push_notification.send_error");
  }
}
