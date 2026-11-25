import { HttpError, jsonResponse, readJson, safeError, serviceRpc } from "../_shared/http.ts";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST.");
    const configuredSecret = Deno.env.get("NOTIFICATION_WORKER_SECRET");
    const suppliedSecret = request.headers.get("x-worker-secret") ?? "";
    if (!configuredSecret || !constantTimeEqual(suppliedSecret, configuredSecret)) {
      throw new HttpError(401, "WORKER_AUTH_REQUIRED", "Worker authentication required.");
    }
    await readJson(request, 128).catch(() => ({})); // Accept an empty POST or a small cron payload.
    const sent = await sendPending();
    const receipts = await checkReceipts();
    const expiredLocations = await serviceRpc("cleanup_expired_location_shares", { p_limit: 500 });
    const expiredRateBuckets = await serviceRpc("cleanup_public_request_buckets", { p_limit: 1_000 });
    return jsonResponse({ data: { sent, receipts, expiredLocations, expiredRateBuckets } });
  } catch (error) {
    return safeError(error, request);
  }
});

async function sendPending() {
  const claimed = await serviceRpc("claim_notification_batch", { p_limit: 50 });
  const rows = Array.isArray(claimed) ? claimed : [];
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  let handled = 0;
  for (const row of rows) {
    try {
      const response = await fetch(EXPO_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          to: row.expo_token,
          title: "QRAlalay assistance update",
          body: "There is an update to a case you can access. Sign in to view it.",
          data: { eventId: row.event_id },
          sound: "default",
          priority: "high",
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const payload = await response.json().catch(() => null);
      const ticket = payload?.data;
      if (response.ok && ticket?.status === "ok" && typeof ticket.id === "string") {
        await serviceRpc("finish_notification_attempt", {
          p_outbox_id: row.outbox_id,
          p_lease_token: row.lease_token,
          p_provider_ticket_id: ticket.id,
          p_error_code: null,
          p_permanent_failure: false,
        });
      } else {
        const code = typeof ticket?.details?.error === "string" ? ticket.details.error : "provider_error";
        await serviceRpc("finish_notification_attempt", {
          p_outbox_id: row.outbox_id,
          p_lease_token: row.lease_token,
          p_provider_ticket_id: null,
          p_error_code: safeCode(code),
          p_permanent_failure: code === "DeviceNotRegistered" || (response.status >= 400 && response.status < 500 && response.status !== 429),
        });
      }
    } catch {
      await serviceRpc("finish_notification_attempt", {
        p_outbox_id: row.outbox_id,
        p_lease_token: row.lease_token,
        p_provider_ticket_id: null,
        p_error_code: "provider_unavailable",
        p_permanent_failure: false,
      }).catch(() => undefined);
    }
    handled += 1;
  }
  return handled;
}

async function checkReceipts() {
  const claimed = await serviceRpc("claim_notification_receipts", { p_limit: 100 });
  const rows = Array.isArray(claimed) ? claimed : [];
  if (rows.length === 0) return 0;
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  let receipts: Record<string, { status?: string; details?: { error?: string } }> = {};
  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids: rows.map((row) => row.provider_ticket_id) }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("receipt provider unavailable");
    const payload = await response.json().catch(() => null);
    receipts = payload?.data ?? {};
  } catch {
    for (const row of rows) {
      await serviceRpc("finish_notification_receipt", {
        p_outbox_id: row.outbox_id, p_lease_token: row.lease_token,
        p_receipt_status: "pending", p_error_code: null,
      }).catch(() => undefined);
    }
    return rows.length;
  }
  for (const row of rows) {
    const receipt = receipts[row.provider_ticket_id];
    const status = receipt?.status === "ok" ? "ok" : receipt?.status === "error" ? "error" : "pending";
    const errorCode = typeof receipt?.details?.error === "string" ? safeCode(receipt.details.error) : null;
    await serviceRpc("finish_notification_receipt", {
      p_outbox_id: row.outbox_id,
      p_lease_token: row.lease_token,
      p_receipt_status: status,
      p_error_code: errorCode,
    }).catch(() => undefined);
  }
  return rows.length;
}

function safeCode(value: string) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : "provider_error";
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}
