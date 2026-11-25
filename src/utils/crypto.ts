import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "@/config/env";

/** Generates a numeric OTP of the configured length, e.g. "482913". */
export function generateNumericOtp(length = env.otp.length): string {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, "0");
}

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10);
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

/** SHA-256 hash for refresh tokens (fast, deterministic — used for DB lookups). */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** URL-safe random token used as the raw refresh token and as QR tokens. */
export function randomUrlSafeToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Generates the cryptographic QR token per resident (unguessable, unique). */
export function generateQrToken(): string {
  return randomUrlSafeToken(env.qr.tokenLengthBytes);
}
