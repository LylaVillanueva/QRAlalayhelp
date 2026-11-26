import type { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/errors";
import type { UserRole } from "@/types/domain";

/**
 * Route-level role gate. Combine with `requireAuth` (must run first).
 * Fine-grained ownership checks (e.g. "this guardian owns this
 * resident") still happen inside the relevant service — this
 * middleware only enforces the coarse role boundary from the use-case
 * diagram (who is even allowed to attempt this action).
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden(`This action requires one of: ${roles.join(", ")}`, "ROLE_NOT_ALLOWED"));
    }
    next();
  };
}
