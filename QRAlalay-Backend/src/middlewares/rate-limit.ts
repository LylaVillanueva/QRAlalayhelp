import rateLimit from "express-rate-limit";
import { env } from "@/config/env";

/**
 * Endpoint-level rate limiter for OTP requests, applied on top of the
 * identifier/IP-based limiting already enforced in otp.service.ts.
 * This layer protects against raw request flooding before it even
 * reaches the DB.
 */
export const otpRequestLimiter = rateLimit({
  windowMs: env.otp.requestWindowMinutes * 60_000,
  max: env.otp.maxRequestsPerWindow * 5, // generous ceiling; service layer enforces the strict per-identifier limit
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
});

/** General-purpose limiter for public, unauthenticated endpoints (QR scan). */
export const publicEndpointLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
});

/** Slows online guessing of the one-time bootstrap credential. */
export const bootstrapLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many bootstrap attempts. Please try again later." } },
});
