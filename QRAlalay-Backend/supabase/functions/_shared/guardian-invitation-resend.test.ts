import { handleResendGuardianInvitation } from "../resend-guardian-invitation/handler.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const profileId = "a3200000-0000-4000-8000-000000000003";
const authUserId = "a1200000-0000-4000-8000-000000000003";
const requestId = "a5200000-0000-4000-8000-000000000001";
const email = "guardian@example.test";

function request(token = "unit-test-official-token") {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request("https://edge.test/resend-guardian-invitation", {
    method: "POST", headers, body: JSON.stringify({ profileId }),
  });
}

function withMockFetch(inviteResponse: Response) {
  const oldFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    calls.push({ url, body });
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "official-test-user" }), { status: 200 });
    if (url.endsWith("/rest/v1/rpc/prepare_guardian_invitation_resend")) {
      return new Response(JSON.stringify([{ request_id: requestId, email, auth_user_id: authUserId }]), { status: 200 });
    }
    if (url.endsWith("/auth/v1/invite")) return inviteResponse;
    if (url.endsWith("/rest/v1/rpc/complete_guardian_invitation_resend")) return new Response("true", { status: 200 });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = oldFetch; } };
}

Deno.test("guardian resend targets the existing unconfirmed Auth account and records accepted outcome", async () => {
  const envNames = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PUBLIC_WEB_ORIGINS", "AUTH_INVITE_REDIRECT_URL"];
  const oldEnv = new Map(envNames.map((name) => [name, Deno.env.get(name)]));
  Deno.env.set("SUPABASE_URL", "https://supabase.test");
  Deno.env.set("SUPABASE_ANON_KEY", "unit-test-anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-key");
  Deno.env.set("PUBLIC_WEB_ORIGINS", "https://www.qralalay.app");
  Deno.env.set("AUTH_INVITE_REDIRECT_URL", "https://www.qralalay.app/auth/accept");
  const mock = withMockFetch(new Response(JSON.stringify({ id: authUserId, email, invited_at: "2026-11-26T00:00:00Z" }), { status: 200 }));
  try {
    const response = await handleResendGuardianInvitation(request());
    const body = await response.json();
    assert(response.status === 200 && body.data.resent === true, "the endpoint returns success without returning email or auth identifiers");
    const invite = mock.calls.find((call) => call.url.includes("/auth/v1/invite"));
    assert(invite?.body?.email === email, "the existing invited address receives the retry");
    assert((invite?.body?.data as Record<string, unknown>)?.qralalay_profile_id === profileId, "the resend retains the same QRAlalay profile mapping");
    const completion = mock.calls.find((call) => call.url.endsWith("/rest/v1/rpc/complete_guardian_invitation_resend"));
    assert(completion?.body?.p_auth_user_id === authUserId && completion.body.p_result === "auth_accepted", "the existing auth id and successful outcome are audited");
  } finally {
    mock.restore();
    for (const [name, value] of oldEnv) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  }
});

Deno.test("guardian resend does not create or replace an account when Auth rejects the email", async () => {
  const envNames = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PUBLIC_WEB_ORIGINS"];
  const oldEnv = new Map(envNames.map((name) => [name, Deno.env.get(name)]));
  Deno.env.set("SUPABASE_URL", "https://supabase.test");
  Deno.env.set("SUPABASE_ANON_KEY", "unit-test-anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-key");
  Deno.env.set("PUBLIC_WEB_ORIGINS", "https://www.qralalay.app");
  const mock = withMockFetch(new Response(JSON.stringify({ message: "provider rejected" }), { status: 502 }));
  try {
    const response = await handleResendGuardianInvitation(request());
    const body = await response.json();
    assert(response.status === 502 && body.error.code === "INVITATION_RESEND_FAILED", "the failure remains generic and does not expose provider details");
    const completion = mock.calls.find((call) => call.url.endsWith("/rest/v1/rpc/complete_guardian_invitation_resend"));
    assert(completion?.body?.p_result === "auth_rejected", "the failed attempt is audited");
    assert(mock.calls.filter((call) => call.url.includes("/auth/v1/invite")).length === 1, "the flow retries the existing user once and never creates another QRAlalay profile");
  } finally {
    mock.restore();
    for (const [name, value] of oldEnv) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  }
});

Deno.test("guardian resend requires an authenticated official session before calling Auth", async () => {
  const envNames = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "PUBLIC_WEB_ORIGINS"];
  const oldEnv = new Map(envNames.map((name) => [name, Deno.env.get(name)]));
  Deno.env.set("SUPABASE_URL", "https://supabase.test");
  Deno.env.set("SUPABASE_ANON_KEY", "unit-test-anon-key");
  Deno.env.set("PUBLIC_WEB_ORIGINS", "https://www.qralalay.app");
  const oldFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
  try {
    const response = await handleResendGuardianInvitation(request(""));
    assert(response.status === 401, "unauthenticated callers are rejected");
    assert(calls.every((url) => !url.endsWith("/auth/v1/invite")), "Auth invitation endpoint is never called without an authenticated session");
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of oldEnv) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  }
});
