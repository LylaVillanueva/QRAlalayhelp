import { z } from "zod";

const phone = z.string().trim().regex(/^\+?[0-9]{3,15}$/).refine((value) => value.replace(/^\+/, "") !== "911", "Use the barangay's own contact number.");
export const saveBarangayContactSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1).max(100),
  phone,
  availability: z.string().trim().max(120).nullable().optional(),
  isPrimary: z.boolean().optional(),
}).strict();
export const barangayContactIdSchema = z.object({ contactId: z.string().uuid() });
export const contactVerificationSchema = z.object({ confirmed: z.boolean() }).strict();
