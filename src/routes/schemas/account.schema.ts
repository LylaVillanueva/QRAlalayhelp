import { z } from "zod";

export const accountRoleSchema = z.enum(["guardian", "barangay_official", "barangay_responder"]);
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use an international phone number, for example +639171234567");
const fields = {
  fullName: z.string().trim().min(2).max(150),
  phone: phone.nullable().optional(),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  position: z.string().trim().max(100).nullable().optional(),
  homeAddress: z.string().trim().max(300).nullable().optional(),
};
export const createAccountSchema = z.object({
  ...fields,
  role: accountRoleSchema,
  residentIds: z.array(z.string().uuid()).max(50).default([]),
  relationship: z.string().trim().max(100).optional(),
}).strict().superRefine((data, context) => {
  if (!data.phone && !data.email) context.addIssue({ code: 'custom', path: ['phone'], message: 'Provide a phone number or email.' });
  if (data.role !== 'guardian' && data.residentIds.length) context.addIssue({ code: 'custom', path: ['residentIds'], message: 'Only guardians can be linked to wards.' });
});
export const updateAccountSchema = z.object(fields).partial().strict().refine((data) => Object.keys(data).length > 0, 'Provide at least one field.');
export const changeRoleSchema = z.object({ role: accountRoleSchema, position: fields.position }).strict();
export const accountStatusSchema = z.object({ isActive: z.boolean() }).strict();
export const accountIdSchema = z.object({ userId: z.string().uuid() });

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
