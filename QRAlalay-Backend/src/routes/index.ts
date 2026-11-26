import { Router } from "express";
import authRoutes from "@/routes/auth.routes";
import userRoutes from "@/routes/user.routes";
import qrRoutes from "@/routes/qr.routes";
import incidentRoutes from "@/routes/incident.routes";
import auditRoutes from "@/routes/audit.routes";
import dashboardRoutes from "@/routes/dashboard.routes";
import { pool } from "@/db/pool";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/qr", qrRoutes);
router.use("/incidents", incidentRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
