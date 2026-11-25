import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "@/middlewares/auth";
import { requireRole } from "@/middlewares/rbac";
import { validate } from "@/middlewares/validate";
import { listAuditLogs } from "@/services/audit.service";
import { AppError } from "@/utils/errors";

const router = Router();

const querySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  offset: z.coerce.number().min(0).optional(),
});

/**
 * GET /api/audit-logs — [5] Incident Lifecycle History & System Audit Logs.
 * Barangay officials see every log; guardians and responders get only
 * their own action history (see listAuditLogs).
 */
router.get("/", requireAuth, requireRole("barangay_official", "barangay_responder", "guardian"), validate({ query: querySchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw AppError.unauthorized();
    const logs = await listAuditLogs(req.query as any, req.user);
    res.status(200).json({ data: logs });
  } catch (err) {
    next(err);
  }
});

export default router;
