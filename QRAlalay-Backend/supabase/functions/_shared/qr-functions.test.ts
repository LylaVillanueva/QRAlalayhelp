import { handleExportQrCard } from "../export-qr-card/handler.ts";
import { handleIssueQrCard } from "../issue-qr-card/handler.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function testRequest(path: string, body: Record<string, unknown>, token = "unit-test-user-token") {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", "Bearer " + token);
  return new Request("https://edge.test/" + path, { method: "POST", headers, body: JSON.stringify(body) });
}

Deno.test("QR issuance and export round-trip the same active credential without rotation", async () => {
  const envNames = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "PUBLIC_SITE_ORIGIN", "PUBLIC_WEB_ORIGINS", "QR_CARD_ENCRYPTION_KEY_V1"];
  const oldEnv = new Map(envNames.map((name) => [name, Deno.env.get(name)]));
  const oldFetch = globalThis.fetch;
  const residentId = "22222222-2222-4222-8222-222222222222";
  let issued: Record<string, unknown> | null = null;
  let issueCallCount = 0;
  const rpcCalls: string[] = [];

  Deno.env.set("SUPABASE_URL", "https://supabase.test");
  Deno.env.set("SUPABASE_ANON_KEY", "unit-test-anon-key");
  Deno.env.set("PUBLIC_SITE_ORIGIN", "https://www.qralalay.app/");
  Deno.env.set("PUBLIC_WEB_ORIGINS", "https://www.qralalay.app");
  Deno.env.set("QR_CARD_ENCRYPTION_KEY_V1", testKey());
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "unit-test-user" }), { status: 200 });
    if (url.endsWith("/rest/v1/rpc/issue_qr_card_secure")) {
      issueCallCount++;
      rpcCalls.push("issue_qr_card_secure");
      issued = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify(issued.p_card_id), { status: 200 });
    }
    if (url.endsWith("/rest/v1/rpc/get_qr_card_for_export")) {
      rpcCalls.push("get_qr_card_for_export");
      const args = JSON.parse(String(init?.body));
      assert(issued !== null && args.p_card_id === issued.p_card_id, "export reads the card just issued");
      return new Response(JSON.stringify({
        cardId: issued.p_card_id,
        residentId: issued.p_resident_id,
        tokenHash: issued.p_token_hash,
        encryptedToken: issued.p_encrypted_token,
        reexportable: true,
      }), { status: 200 });
    }
    throw new Error("Unexpected fetch in isolated QR function test");
  }) as typeof fetch;

  try {
    const issueResponse = await handleIssueQrCard(testRequest("issue-qr-card", { residentId }));
    const issuePayload = await issueResponse.json();
    assert(issueResponse.status === 201, "authorized issuance succeeds");
    assert(issueResponse.headers.get("cache-control") === "no-store", "issuance response is not cacheable");
    assert(issued !== null, "issuance persists encrypted token material");
    const saved = issued as Record<string, unknown>;
    const issuedData = issuePayload.data as Record<string, unknown>;
    const cardId = String(issuedData.cardId);
    const token = String(issuedData.token);
    assert(saved.p_card_id === cardId && saved.p_resident_id === residentId, "persistence identifiers match the issued card");
    assert(await (async () => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    })() === saved.p_token_hash, "stored public lookup hash is derived from the returned token");
    assert(typeof saved.p_encrypted_token === "string", "raw token is not sent to the database");

    const exportResponse = await handleExportQrCard(testRequest("export-qr-card", { cardId }));
    const exportPayload = await exportResponse.json();
    assert(exportResponse.status === 200, "authorized export succeeds");
    assert(exportResponse.headers.get("cache-control") === "no-store", "export response is not cacheable");
    assert(exportPayload.data.cardId === cardId, "export returns the same card id");
    assert(exportPayload.data.publicUrl === issuedData.publicUrl, "export returns the exact original QR URL");
    assert(!("token" in exportPayload.data), "export does not add a separate plaintext token field");
    assert(issueCallCount === 1, "export did not issue or rotate a card");
    assert(rpcCalls.join(",") === "issue_qr_card_secure,get_qr_card_for_export", "functions use the matching secure RPC pair");
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of oldEnv) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  }
});

Deno.test("legacy QR export returns 409 without replacement and export rejects missing authentication", async () => {
  const envNames = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "PUBLIC_SITE_ORIGIN"];
  const oldEnv = new Map(envNames.map((name) => [name, Deno.env.get(name)]));
  const oldFetch = globalThis.fetch;
  let issueCallCount = 0;
  let exportReadCount = 0;
  Deno.env.set("SUPABASE_URL", "https://supabase.test");
  Deno.env.set("SUPABASE_ANON_KEY", "unit-test-anon-key");
  Deno.env.set("PUBLIC_SITE_ORIGIN", "https://www.qralalay.app");
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "unit-test-user" }), { status: 200 });
    if (url.endsWith("/rest/v1/rpc/get_qr_card_for_export")) {
      exportReadCount++;
      return new Response(JSON.stringify({
        cardId: "11111111-1111-4111-8111-111111111111",
        residentId: "22222222-2222-4222-8222-222222222222",
        tokenHash: "a".repeat(64),
        encryptedToken: null,
        reexportable: false,
      }), { status: 200 });
    }
    if (url.endsWith("/rest/v1/rpc/issue_qr_card_secure")) issueCallCount++;
    throw new Error("Unexpected fetch in legacy QR test");
  }) as typeof fetch;
  try {
    const legacyResponse = await handleExportQrCard(testRequest("export-qr-card", { cardId: "11111111-1111-4111-8111-111111111111" }));
    const legacyPayload = await legacyResponse.json();
    assert(legacyResponse.status === 409 && legacyPayload.error.code === "QR_EXPORT_UNAVAILABLE", "legacy card gets the explicit 409 response");
    assert(issueCallCount === 0, "legacy export failure does not replace the card");
    const before = exportReadCount;
    const unauthenticated = await handleExportQrCard(testRequest("export-qr-card", { cardId: "11111111-1111-4111-8111-111111111111" }, ""));
    assert(unauthenticated.status === 401 && exportReadCount === before, "missing authentication is rejected before credential lookup");
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of oldEnv) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  }
});
