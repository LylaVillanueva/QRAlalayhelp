import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { pool, withTransaction } from "@/db/pool";
import { env } from "@/config/env";
import { sha256 } from "@/utils/crypto";
import { AppError } from "@/utils/errors";
import type { AccessTokenPayload, RefreshTokenPayload, AuthUser } from "@/types/domain";

export interface DeviceMetadata {
  deviceId: string;
  platform: string; // 'ios' | 'android' | 'web'
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number; // seconds
}

/**
 * Issues a brand-new access + refresh token pair for a device and
 * persists the hashed refresh token (never the raw value) alongside
 * device metadata, per "Persistent Device Sessions" requirement.
 */
function createTokenPair(user: AuthUser, device: DeviceMetadata, tokenId = uuidv4()) {
  const accessPayload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    barangayId: user.barangayId,
    deviceId: device.deviceId,
    type: "access",
  };
  // expiresIn takes a plain number of seconds here — no string parsing,
  // no branded-type casting, works identically across jsonwebtoken versions.
  const accessToken = jwt.sign(accessPayload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtlSeconds,
  });

  const refreshPayload: RefreshTokenPayload = {
    sub: user.id,
    deviceId: device.deviceId,
    tokenId,
    type: "refresh",
  };
  // Refresh JWT is intentionally long-lived — mobile sessions persist
  // until explicit logout. Revocation is enforced via the DB row, not
  // JWT expiry, so we can kill a session server-side at any time.
  const refreshTtlSeconds = env.jwt.refreshTtlDays * 24 * 60 * 60;
  const refreshToken = jwt.sign(refreshPayload, env.jwt.refreshSecret, {
    expiresIn: refreshTtlSeconds,
  });
  // What's stored must be derivable from what the client actually holds,
  // or rotation can never match it back up — hash the issued JWT itself.
  const refreshTokenHash = sha256(refreshToken);

  return { tokenId, refreshTokenHash, pair: { accessToken, refreshToken, accessTokenExpiresIn: env.jwt.accessTtlSeconds } };
}

/** Issues a fresh login session, replacing any prior session for the device. */
export async function issueTokenPair(user: AuthUser, device: DeviceMetadata): Promise<TokenPair> {
  const created = createTokenPair(user, device);
  // One active refresh token per (user, device) — re-login on the same
  // device replaces the prior session rather than accumulating rows.
  await pool.query(
    `insert into refresh_tokens (id, user_id, token_hash, device_id, platform)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, device_id) where revoked_at is null
     do update set id = excluded.id,
                   token_hash = excluded.token_hash,
                   platform = excluded.platform`,
    [created.tokenId, user.id, created.refreshTokenHash, device.deviceId, device.platform]
  );

  return created.pair;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
  } catch {
    throw AppError.unauthorized("Access token is invalid or expired", "INVALID_ACCESS_TOKEN");
  }
}

/**
 * Rotates a refresh token: verifies the JWT signature, checks the DB
 * row hasn't been revoked/replaced (reuse detection), revokes the old
 * row, and issues a fresh pair. This is what keeps mobile sessions
 * alive indefinitely without ever re-prompting for OTP.
 */
export async function rotateRefreshToken(rawRefreshToken: string): Promise<TokenPair> {
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(rawRefreshToken, env.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    throw AppError.unauthorized("Refresh token is invalid or expired", "INVALID_REFRESH_TOKEN");
  }

  const tokenHash = sha256(rawRefreshToken);
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `select rt.*, u.role, u.full_name, u.phone_number, u.email, u.barangay_id, u.is_active, b.name as barangay_name
       from refresh_tokens rt
       join users u on u.id = rt.user_id
       left join barangays b on b.id = u.barangay_id
       where rt.id = $1 and rt.user_id = $2
       for update of rt`,
      [payload.tokenId, payload.sub]
    );
    const row = rows[0];
    if (!row) return { error: "SESSION_NOT_FOUND" as const };

    if (row.revoked_at || row.token_hash !== tokenHash || row.device_id !== payload.deviceId) {
      // A previously used token, or a token whose persisted device/hash no
      // longer matches, indicates replay. Commit revocation before returning
      // the auth error so it cannot be rolled back with an exception.
      await client.query(`update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`, [payload.sub]);
      return { error: "TOKEN_REUSE_DETECTED" as const };
    }
    if (!row.is_active) {
      await client.query(`update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`, [payload.sub]);
      return { error: "ACCOUNT_DEACTIVATED" as const };
    }

    const user: AuthUser = {
      id: row.user_id,
      role: row.role,
      fullName: row.full_name,
      phoneNumber: row.phone_number,
      email: row.email,
      barangayId: row.barangay_id,
      barangayName: row.barangay_name ?? null,
    };
    const device = { deviceId: row.device_id, platform: row.platform };
    const created = createTokenPair(user, device, row.id);
    const updated = await client.query(
      `update refresh_tokens set token_hash = $1, platform = $2
       where id = $3 and revoked_at is null`,
      [created.refreshTokenHash, device.platform, row.id]
    );
    if (updated.rowCount !== 1) return { error: "SESSION_NOT_FOUND" as const };
    return { pair: created.pair };
  });

  if ("error" in outcome) {
    if (outcome.error === "ACCOUNT_DEACTIVATED") throw AppError.forbidden("Account has been deactivated", "ACCOUNT_DEACTIVATED");
    if (outcome.error === "TOKEN_REUSE_DETECTED") throw AppError.unauthorized("Session token was already used or revoked. Please sign in again.", "TOKEN_REUSE_DETECTED");
    throw AppError.unauthorized("Session not found", "SESSION_NOT_FOUND");
  }
  return outcome.pair;
}

/** Revokes a single device's session — used by POST /auth/logout. */
export async function revokeDeviceSession(userId: string, deviceId: string): Promise<void> {
  await pool.query(
    `update refresh_tokens set revoked_at = now() where user_id = $1 and device_id = $2 and revoked_at is null`,
    [userId, deviceId]
  );
}

/** Revokes every session for a user — e.g. "log out of all devices". */
export async function revokeAllSessions(userId: string): Promise<void> {
  await pool.query(`update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);
}
