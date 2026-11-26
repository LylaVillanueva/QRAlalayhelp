const encoder = new TextEncoder();

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders(null), ...headers },
  });
}

export function corsHeaders(origin: string | null) {
  const configured = (Deno.env.get("PUBLIC_WEB_ORIGINS") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const headers: Record<string, string> = { vary: "Origin", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info" };
  if (origin && configured.includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

export function preflight(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export function requireAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = (Deno.env.get("PUBLIC_WEB_ORIGINS") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed.");
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function safeError(error: unknown, request: Request) {
  if (error instanceof HttpError) return jsonResponse({ error: { code: error.code, message: error.message } }, error.status, corsHeaders(request.headers.get("origin")));
  // Do not return or log provider/Postgres bodies; they may contain SQL details.
  console.error("edge_request_failed", error instanceof Error ? error.name : "unknown");
  return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } }, 500, corsHeaders(request.headers.get("origin")));
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const size = Number(request.headers.get("content-length") ?? "0");
  if (size > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  const text = await request.text();
  if (encoder.encode(text).byteLength > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not-object");
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Send a valid JSON object.");
  }
}

export function requireString(value: unknown, name: string, pattern?: RegExp): string {
  if (typeof value !== "string" || !value.length || (pattern && !pattern.test(value))) {
    throw new HttpError(400, "INVALID_INPUT", `Invalid ${name}.`);
  }
  return value;
}

export function optionalText(value: unknown, name: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) throw new HttpError(400, "INVALID_INPUT", `Invalid ${name}.`);
  return value.trim() || null;
}

export function optionalFinite(value: unknown, name: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, "INVALID_INPUT", `Invalid ${name}.`);
  }
  return value;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function supabaseUrl() { return requiredEnv("SUPABASE_URL").replace(/\/$/, ""); }
function serviceKey() { return requiredEnv("SUPABASE_SERVICE_ROLE_KEY"); }

async function rpc(functionName: string, args: Record<string, unknown>, key: string, bearer = key) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.code;
    const status = code === "P0002" ? 404 : code === "42501" ? 403 : ["22023", "23514"].includes(code) ? 400 : ["23505", "40001"].includes(code) ? 409 : 500;
    throw new HttpError(status, status === 500 ? "DATABASE_ERROR" : code, status === 500 ? "The request could not be completed." : "The request was rejected.");
  }
  return payload;
}

export function serviceRpc(functionName: string, args: Record<string, unknown>) {
  const key = serviceKey();
  return rpc(functionName, args, key, key);
}

export async function authenticatedRpc(request: Request, functionName: string, args: Record<string, unknown>) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/i);
  if (!match) throw new HttpError(401, "AUTH_REQUIRED", "Sign in to continue.");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const authResponse = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${match[1]}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!authResponse.ok) throw new HttpError(401, "AUTH_REQUIRED", "Sign in to continue.");
  return rpc(functionName, args, anonKey, match[1]);
}

export async function enforceIpQuota(request: Request, label: string, max: number, seconds: number) {
  const pepper = requiredEnv("RATE_LIMIT_PEPPER");
  // The gateway appends the peer address to X-Forwarded-For; use its final
  // value and persist only a keyed digest, never the raw IP address.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((item) => item.trim()).filter(Boolean);
  const address = forwarded?.at(-1) ?? request.headers.get("x-real-ip") ?? "unknown";
  const bucket = await hmacHex(pepper, `${label}:${address}`);
  const allowed = await serviceRpc("consume_public_request_quota", {
    p_bucket_hash: bucket, p_limit: max, p_window_seconds: seconds,
  });
  if (allowed !== true) throw new HttpError(429, "RATE_LIMITED", "Too many requests. Please wait and try again.");
}

export function randomToken(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
