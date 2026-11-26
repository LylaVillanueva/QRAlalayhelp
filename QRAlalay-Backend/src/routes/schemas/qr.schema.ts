import { z } from "zod";

export const generateQrSchema = z.object({
  residentId: z.string().uuid(),
});

export const tokenParamSchema = z.object({
  token: z.string().min(10),
});

export const scanEventSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  bystanderNotes: z.string().max(1000).optional(),
});

export const cancelScanSchema = z.object({
  cancelToken: z.string().min(10),
});

export const shareLocationSchema = z.object({
  shareToken: z.string().min(10),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const stopLocationSchema = z.object({
  shareToken: z.string().min(10),
});
