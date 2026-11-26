const encoder = new TextEncoder();
const KEY_ENV = "QR_CARD_ENCRYPTION_KEY_V1";

async function loadKey() {
  const configured = Deno.env.get(KEY_ENV)?.trim();
  if (!configured) throw new Error(`missing ${KEY_ENV}`);
  let raw: Uint8Array;
  try {
    raw = Uint8Array.from(atob(configured), (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`invalid ${KEY_ENV} encoding`);
  }
  if (raw.length !== 32) throw new Error(`${KEY_ENV} must decode to 32 bytes`);
  return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid QR ciphertext encoding");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function associatedData(cardId: string, residentId: string) {
  return encoder.encode(`qr-card:v1:${cardId}:${residentId}`);
}

export async function encryptQrToken(cardId: string, residentId: string, token: string) {
  const key = await loadKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: associatedData(cardId, residentId), tagLength: 128 },
    key,
    encoder.encode(token),
  );
  return `v1.${encodeBase64Url(nonce)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptQrToken(cardId: string, residentId: string, stored: string) {
  const match = stored.match(/^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{79})$/);
  if (!match) throw new Error("unsupported QR ciphertext format");
  const key = await loadKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(match[1]), additionalData: associatedData(cardId, residentId), tagLength: 128 },
    key,
    decodeBase64Url(match[2]),
  );
  const token = new TextDecoder().decode(plaintext);
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) throw new Error("invalid decrypted QR token");
  return token;
}
