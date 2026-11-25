import { z } from "zod";

const phoneRegex = /^\+[1-9]\d{7,14}$/; // E.164
const emailSchema = z.string().email();

// Emails are stored lower-case (see migration 012), so normalise them here
// before any lookup or insert.
const normalizeIdentifier = <T extends { channel: "phone" | "email"; identifier: string }>(data: T): T =>
  data.channel === "email" ? { ...data, identifier: data.identifier.trim().toLowerCase() } : data;
const phoneSchema = z.string().regex(phoneRegex, "Phone number must be in E.164 format, e.g. +639171234567");

export const sendOtpSchema = z
  .object({
    channel: z.enum(["phone", "email"]),
    identifier: z.string().min(3),
  })
  .refine((data) => (data.channel === "phone" ? phoneRegex.test(data.identifier) : emailSchema.safeParse(data.identifier).success), {
    message: "identifier does not match the selected channel's format",
    path: ["identifier"],
  })
  .transform(normalizeIdentifier);

export const deviceSchema = z.object({
  deviceId: z.string().min(4).max(255),
  platform: z.enum(["ios", "android", "web"]),
});

export const verifyOtpSchema = z.object({
  channel: z.enum(["phone", "email"]),
  identifier: z.string().min(3),
  otp: z.string().length(6),
  device: deviceSchema,
}).strict().transform(normalizeIdentifier);

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const logoutSchema = z.object({
  deviceId: z.string().min(4).optional(), // defaults to req.deviceId from the access token
});

export const bootstrapSchema = z.object({
  secret: z.string().min(1),
  barangay: z.object({
    name: z.string().min(1),
    municipality: z.string().min(1),
    province: z.string().min(1),
  }),
  official: z.object({
    fullName: z.string().min(1),
    phone: phoneSchema.optional(),
    email: z.string().email().optional(),
  }).refine(d => d.phone || d.email, { message: "Provide a phone number or email for login" }),
});

export { phoneSchema, emailSchema };
