import { pool, withTransaction } from "@/db/pool";
import { env } from "@/config/env";
import { generateNumericOtp, hashSecret, verifySecret } from "@/utils/crypto";
import { AppError } from "@/utils/errors";
import { sendEmailOtp, sendSmsOtp } from "@/services/notification.service";
import type { AuthChannel } from "@/types/domain";

export interface SendOtpParams {
  identifier: string; // raw phone (E.164) or email
  channel: AuthChannel;
  requesterIp?: string;
}

/**
 * Enforces "max N OTP requests per window per IP/identifier" and then
 * persists a hashed code, and delivers it. The deterministic code is
 * available only outside production; production always uses a random code
 * and a configured delivery provider.
 */
export async function requestOtp({ identifier, channel, requesterIp }: SendOtpParams): Promise<{ expiresAt: Date }> {
  const otp = env.isProd ? generateNumericOtp(env.otp.length) : env.otp.developmentCode;
  const otpHash = await hashSecret(otp);
  const expiresAt = new Date(Date.now() + env.otp.ttlMinutes * 60_000);

  const otpId = await withTransaction(async (client) => {
    await enforceRateLimit(client, identifier, requesterIp);
    const { rows } = await client.query(
      `insert into otp_codes (identifier, channel, otp_hash, expires_at)
       values ($1, $2, $3, $4) returning id`,
      [identifier, channel, otpHash, expiresAt]
    );
    await client.query(`insert into otp_request_log (identifier, requester_ip) values ($1, $2)`, [identifier, requesterIp ?? null]);
    return rows[0].id as string;
  });

  if (env.isProd) {
    try {
      if (channel === "email") await sendEmailOtp(identifier, otp);
      else await sendSmsOtp(identifier, otp);
    } catch (err) {
      // A failed delivery must not leave a valid code waiting to be guessed.
      await pool.query(`update otp_codes set consumed_at = now() where id = $1 and consumed_at is null`, [otpId]);
      throw err;
    }
  }

  return { expiresAt };
}

async function enforceRateLimit(client: import("pg").PoolClient, identifier: string, requesterIp?: string): Promise<void> {
  const windowStart = new Date(Date.now() - env.otp.requestWindowMinutes * 60_000);

  // Serialize concurrent requests with the same identifier/IP before
  // checking counts, otherwise parallel requests can exceed both limits.
  const lockKeys = [`identifier:${identifier}`, ...(requesterIp ? [`ip:${requesterIp}`] : [])].sort();
  for (const lockKey of lockKeys) {
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [lockKey]);
  }

  const { rows: byIdentifier } = await client.query(
    `select count(*)::int as count from otp_request_log where identifier = $1 and created_at > $2`,
    [identifier, windowStart]
  );
  if (byIdentifier[0].count >= env.otp.maxRequestsPerWindow) {
    throw AppError.tooManyRequests(
      `Too many OTP requests for this ${identifier.includes("@") ? "email" : "phone number"}. Try again later.`,
      "OTP_RATE_LIMITED_IDENTIFIER"
    );
  }

  if (requesterIp) {
    const { rows: byIp } = await client.query(
      `select count(*)::int as count from otp_request_log where requester_ip = $1 and created_at > $2`,
      [requesterIp, windowStart]
    );
    // A slightly higher ceiling per-IP since NAT'd networks (e.g. a
    // barangay hall) may have several legitimate users behind one IP.
    if (byIp[0].count >= env.otp.maxRequestsPerWindow * 3) {
      throw AppError.tooManyRequests("Too many OTP requests from this network. Try again later.", "OTP_RATE_LIMITED_IP");
    }
  }
}

export interface VerifyOtpParams {
  identifier: string;
  channel: AuthChannel;
  otp: string;
}

/**
 * Verifies against the latest unconsumed, unexpired OTP for the
 * identifier. Increments attempts on every failure and locks the code
 * out once OTP_MAX_VERIFY_ATTEMPTS is reached, forcing a fresh /send-otp call.
 */
export async function verifyOtp({ identifier, channel, otp }: VerifyOtpParams): Promise<void> {
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `select * from otp_codes
       where identifier = $1 and channel = $2 and consumed_at is null
       order by created_at desc
       limit 1
       for update`,
      [identifier, channel]
    );
    const record = rows[0];

    if (!record) throw AppError.badRequest("No pending OTP for this identifier. Request a new code.", "OTP_NOT_FOUND");
    if (new Date(record.expires_at) < new Date()) {
      throw AppError.badRequest("OTP has expired. Request a new code.", "OTP_EXPIRED");
    }
    if (record.attempts >= env.otp.maxVerifyAttempts) {
      throw AppError.tooManyRequests("Too many incorrect attempts. Request a new code.", "OTP_LOCKED");
    }

    const isValid = await verifySecret(otp, record.otp_hash);
    if (!isValid) {
      await client.query(`update otp_codes set attempts = attempts + 1 where id = $1`, [record.id]);
      return false;
    }

    await client.query(`update otp_codes set consumed_at = now() where id = $1`, [record.id]);
    return true;
  });
  if (!outcome) throw AppError.badRequest("Incorrect OTP.", "OTP_INCORRECT");
}
