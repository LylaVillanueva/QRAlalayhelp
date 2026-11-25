import { z } from "zod";

const phoneRegex = /^\+[1-9]\d{7,14}$/; // E.164

// A guardian who doesn't have an account yet — enrolling a resident with
// this creates (or reuses, if the phone/email already matches one) a real
// guardian account, so that person can log in and see this resident.
const newGuardianSchema = z
  .object({
    fullName: z.string().min(2).max(150),
    relation: z.string().min(1).max(100),
    phone: z.string().regex(phoneRegex, "Phone number must be in E.164 format, e.g. +639171234567").optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
  })
  .refine((data) => data.phone || data.email, {
    message: "Provide at least a phone number or email so the guardian can log in",
    path: ["phone"],
  });

const enrollResidentObjectSchema = z.object({
  fullName: z.string().min(2).max(150),
  residentType: z.enum(["Senior Citizen", "Person with Disability"]).optional(),
  dateOfBirth: z.string().date().optional(),
  // Limits match the CHARACTER VARYING(n) columns from migration 012.
  medicalNotes: z.string().max(2000).optional(),
  homeAddress: z.string().max(300).optional(),
  guardianId: z.string().uuid().optional(),
  newGuardian: newGuardianSchema.optional(),
});

export const enrollResidentSchema = enrollResidentObjectSchema.refine(
  (data) => [data.guardianId, data.newGuardian].filter(Boolean).length <= 1,
  {
    message: "Provide at most one of guardianId or newGuardian",
    path: ["guardianId"],
  }
);

export const updateResidentSchema = enrollResidentObjectSchema.partial();

export const residentIdParamSchema = z.object({ residentId: z.string().uuid() });

export const registerGuardianSchema = z
  .object({
    fullName: z.string().min(2).max(150),
    phone: z.string().regex(phoneRegex, "Phone number must be in E.164 format, e.g. +639171234567").optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    residentIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .refine((data) => data.phone || data.email, {
    message: "Provide at least a phone number or email so the guardian can log in",
    path: ["phone"],
  });

// A base64 JPEG/PNG/WebP. The app sends ~600px images (well under the
// 1 MB request limit); photo.service checks the actual bytes.
export const photoUploadSchema = z.object({
  image: z.string().min(100).max(1_000_000),
});
