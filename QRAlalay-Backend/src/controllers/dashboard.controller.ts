import type { Request, Response, NextFunction } from "express";
import * as dashboardService from "@/services/dashboard.service";
import { AppError } from "@/utils/errors";

/** GET /api/dashboard/stats — barangay staff home-screen summary tiles. */
export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const stats = await dashboardService.getDashboardStats(req.user);
    res.status(200).json({ data: stats });
  } catch (err) {
    next(err);
  }
}
