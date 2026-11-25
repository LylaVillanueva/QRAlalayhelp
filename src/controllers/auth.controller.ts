import type { Request, Response, NextFunction } from "express";
import * as authService from "@/services/auth.service";
import * as tokenService from "@/services/token.service";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { withTransaction } from "@/db/pool";
import { timingSafeEqual } from "node:crypto";

export async function sendOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { channel, identifier } = req.body;
    const { expiresAt } = await authService.sendOtp({ identifier, channel, requesterIp: req.ip });
    res.status(200).json({ data: { message: "If this account can receive a code, it will be sent shortly.", expiresAt } });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { channel, identifier, otp, device } = req.body;
    const result = await authService.verifyOtpAndLogin({
      identifier,
      channel,
      otp,
      device,
    });
    res.status(result.isNewUser ? 201 : 200).json({
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresIn: result.tokens.accessTokenExpiresIn,
        isNewUser: result.isNewUser,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const tokens = await tokenService.rotateRefreshToken(refreshToken);
    res.status(200).json({
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.accessTokenExpiresIn,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const deviceId = req.body.deviceId ?? req.deviceId;
    await tokenService.revokeDeviceSession(req.user.id, deviceId);
    res.status(200).json({ data: { message: "Logged out" } });
  } catch (err) {
    next(err);
  }
}

export async function bootstrap(req: Request, res: Response, next: NextFunction) {
  try {
    const { secret, barangay, official } = req.body;

    if (!env.bootstrap.secret) {
      throw AppError.forbidden("Bootstrap is not enabled. Set BOOTSTRAP_SECRET in your environment.");
    }
    const suppliedSecret = Buffer.from(secret, "utf8");
    const expectedSecret = Buffer.from(env.bootstrap.secret, "utf8");
    if (suppliedSecret.length !== expectedSecret.length || !timingSafeEqual(suppliedSecret, expectedSecret)) {
      throw AppError.forbidden("Invalid bootstrap secret.");
    }

    const result = await withTransaction(async (client) => {
      // The lock makes the first-official check and inserts one atomic,
      // one-time operation even if two bootstrap requests race.
      await client.query("select pg_advisory_xact_lock(hashtextextended('resqr-bootstrap', 0))");
      const { rows: existing } = await client.query(
        "select id from users where role = 'barangay_official' limit 1"
      );
      if (existing.length > 0) {
        throw AppError.conflict("System already has a barangay official. Bootstrap is only for first-time setup.");
      }

      const { rows: barangayRows } = await client.query(
        `insert into barangays (name, municipality, province) values ($1, $2, $3) returning id, name`,
        [barangay.name, barangay.municipality, barangay.province]
      );
      const barangayId = barangayRows[0].id;

      const { rows: userRows } = await client.query(
        `insert into users (role, full_name, phone_number, email, barangay_id)
         values ('barangay_official', $1, $2, $3, $4)
         returning id, role, full_name, phone_number, email`,
        [official.fullName, official.phone ?? null, official.email ?? null, barangayId]
      );

      await client.query(
        `insert into audit_logs (action, entity_type, entity_id, metadata)
         values ('system.bootstrap', 'user', $1, $2)`,
        [userRows[0].id, JSON.stringify({ barangayId, barangayName: barangay.name })]
      );
      return { barangay: barangayRows[0], official: userRows[0] };
    });

    res.status(201).json({
      data: {
        message: "System bootstrapped. The official can now log in with OTP.",
        barangay: result.barangay,
        official: result.official,
      },
    });
  } catch (err) {
    next(err);
  }
}
