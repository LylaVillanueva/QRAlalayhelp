import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "@/services/token.service";
import { getUserById } from "@/services/auth.service";
import { AppError } from "@/utils/errors";

/**
 * Verifies the Bearer access token, confirms the underlying user still
 * exists (and hasn't been deactivated since the token was issued), and
 * attaches `req.user` / `req.deviceId` for downstream handlers.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw AppError.unauthorized("Missing bearer token", "MISSING_TOKEN");
    }
    const token = header.slice("Bearer ".length);
    const payload = verifyAccessToken(token);

    const user = await getUserById(payload.sub);
    if (!user) throw AppError.unauthorized("User no longer exists", "USER_NOT_FOUND");

    if (payload.role !== user.role || payload.barangayId !== user.barangayId) {
      throw AppError.unauthorized('Account access has changed. Please sign in again.', 'ACCOUNT_ACCESS_CHANGED');
    }
    req.user = user;
    req.deviceId = payload.deviceId;
    next();
  } catch (err) {
    next(err);
  }
}
