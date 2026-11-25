import { Router } from "express";
import * as authController from "@/controllers/auth.controller";
import { validate } from "@/middlewares/validate";
import { requireAuth } from "@/middlewares/auth";
import { bootstrapLimiter, otpRequestLimiter } from "@/middlewares/rate-limit";
import { sendOtpSchema, verifyOtpSchema, refreshSchema, logoutSchema, bootstrapSchema } from "@/routes/schemas/auth.schema";

const router = Router();

router.post("/send-otp", otpRequestLimiter, validate({ body: sendOtpSchema }), authController.sendOtp);
router.post("/verify-otp", validate({ body: verifyOtpSchema }), authController.verifyOtp);
// Every login uses the verification flow; identifier-only login is disabled.
router.post("/refresh", validate({ body: refreshSchema }), authController.refresh);
router.post("/logout", requireAuth, validate({ body: logoutSchema }), authController.logout);
router.post("/bootstrap", bootstrapLimiter, validate({ body: bootstrapSchema }), authController.bootstrap);

export default router;
