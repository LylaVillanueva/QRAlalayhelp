import { Router } from "express";
import * as dashboardController from "@/controllers/dashboard.controller";
import { requireAuth } from "@/middlewares/auth";
import { requireRole } from "@/middlewares/rbac";

const router = Router();

router.use(requireAuth);

router.get("/stats", requireRole("barangay_official", "barangay_responder"), dashboardController.getStats);

export default router;
