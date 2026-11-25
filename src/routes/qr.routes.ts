import { Router } from "express";
import * as qrController from "@/controllers/qr.controller";
import { requireAuth } from "@/middlewares/auth";
import { requireRole } from "@/middlewares/rbac";
import { validate } from "@/middlewares/validate";
import { publicEndpointLimiter } from "@/middlewares/rate-limit";
import { generateQrSchema, tokenParamSchema, scanEventSchema, cancelScanSchema, shareLocationSchema, stopLocationSchema } from "@/routes/schemas/qr.schema";

const router = Router();

// --- Authenticated (barangay officials issue/manage QR codes) ---
router.post("/generate", requireAuth, requireRole("barangay_official"), validate({ body: generateQrSchema }), qrController.generateQr);
router.delete("/:token", requireAuth, requireRole("barangay_official"), validate({ params: tokenParamSchema }), qrController.revokeQr);

// --- Public (bystander scan flow — no auth, rate-limited) ---
router.get("/:token/public-view", publicEndpointLimiter, validate({ params: tokenParamSchema }), qrController.getPublicView);
router.post(
  "/:token/scan-event",
  publicEndpointLimiter,
  validate({ params: tokenParamSchema, body: scanEventSchema }),
  qrController.recordScanEvent
);
router.post("/cancel", publicEndpointLimiter, validate({ body: cancelScanSchema }), qrController.cancelScan);
router.post("/location", publicEndpointLimiter, validate({ body: shareLocationSchema }), qrController.shareLocation);
router.post("/location/stop", publicEndpointLimiter, validate({ body: stopLocationSchema }), qrController.stopLocation);

export default router;
