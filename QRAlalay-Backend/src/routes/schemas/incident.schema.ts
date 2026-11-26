import { z } from "zod";

export const incidentIdParamSchema = z.object({ incidentId: z.string().uuid() });

export const residentIdParamSchema = z.object({ residentId: z.string().uuid() });

export const createIncidentSchema = z.object({
  residentId: z.string().uuid(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().max(1000).optional(),
});

export const confirmationSchema = z.object({
  decision: z.enum(["safe", "not_safe"]),
  summaryNotes: z.string().max(1000).optional(),
});

export const assignResponderSchema = z.object({
  responderId: z.string().uuid(),
});

export const resolveIncidentSchema = z.object({
  finalActionSummary: z.string().min(3).max(2000),
});

export const unreachableReasonSchema = z.object({
  reason: z.string().min(3).max(500),
});
