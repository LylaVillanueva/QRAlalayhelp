import { decryptQrToken, encryptQrToken } from "./qr-token-crypto.ts";

Deno.test("QR credential encryption round-trips and binds card and resident IDs", async () => {
  const name = "QR_CARD_ENCRYPTION_KEY_V1";
  const previous = Deno.env.get(name);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  Deno.env.set(name, btoa(binary));
  try {
    const cardId = "11111111-1111-4111-8111-111111111111";
    const residentId = "22222222-2222-4222-8222-222222222222";
    const token = "a".repeat(43);
    const encrypted = await encryptQrToken(cardId, residentId, token);
    if (!/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{79}$/.test(encrypted)) throw new Error("unexpected ciphertext shape");
    if (await decryptQrToken(cardId, residentId, encrypted) !== token) throw new Error("round-trip mismatch");
    let wrongRecordRejected = false;
    try { await decryptQrToken(cardId, "33333333-3333-4333-8333-333333333333", encrypted); }
    catch { wrongRecordRejected = true; }
    if (!wrongRecordRejected) throw new Error("ciphertext was not bound to its resident");
  } finally {
    if (previous === undefined) Deno.env.delete(name);
    else Deno.env.set(name, previous);
  }
});
