import { pool } from "@/db/pool";
import { AppError } from "@/utils/errors";
import { requestOtp, verifyOtp } from "@/services/otp.service";
import { issueTokenPair, type DeviceMetadata, type TokenPair } from "@/services/token.service";
import { writeAuditLog } from "@/services/audit.service";
import type { AuthChannel, AuthUser } from "@/types/domain";

export interface SendOtpInput {
  identifier: string;
  channel: AuthChannel;
  requesterIp?: string;
}

export async function sendOtp(input: SendOtpInput) {
  return requestOtp(input);
}

export interface VerifyOtpAndLoginInput {
  identifier: string;
  channel: AuthChannel;
  otp: string;
  device: DeviceMetadata;
}

export interface VerifyOtpAndLoginResult {
  user: AuthUser;
  tokens: TokenPair;
  isNewUser: boolean;
}

/** Verify a login code for an account provisioned by a barangay official. */
export async function verifyOtpAndLogin(input: VerifyOtpAndLoginInput): Promise<VerifyOtpAndLoginResult> {
  await verifyOtp({ identifier: input.identifier, channel: input.channel, otp: input.otp });

  const column = input.channel === "phone" ? "phone_number" : "email";
  const { rows } = await pool.query(
    `select u.*, b.name as barangay_name from users u left join barangays b on b.id = u.barangay_id where u.${column} = $1`,
    [input.identifier]
  );
  const userRow = rows[0];
  const isNewUser = false;

  if (!userRow) {
    throw AppError.notFound("No account found for this identifier. Contact your barangay office to register.", "ACCOUNT_NOT_FOUND");
  }

  if (!userRow.is_active) {
    throw AppError.forbidden("This account has been deactivated. Contact your barangay office.", "ACCOUNT_DEACTIVATED");
  }

  const user: AuthUser = {
    id: userRow.id,
    role: userRow.role,
    fullName: userRow.full_name,
    phoneNumber: userRow.phone_number,
    email: userRow.email,
    barangayId: userRow.barangay_id,
    barangayName: userRow.barangay_name ?? null,
  };

  const tokens = await issueTokenPair(user, input.device);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "user.login", entityType: "user", entityId: user.id, metadata: { deviceId: input.device.deviceId, platform: input.device.platform } });

  return { user, tokens, isNewUser };
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const { rows } = await pool.query(
    `select u.*, b.name as barangay_name from users u left join barangays b on b.id = u.barangay_id where u.id = $1`,
    [userId]
  );
  if (!rows[0] || !rows[0].is_active) return null;
  const row = rows[0];
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    email: row.email,
    barangayId: row.barangay_id,
    barangayName: row.barangay_name ?? null,
  };
}
