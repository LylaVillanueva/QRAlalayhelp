import { z } from "zod";

export const registerPushTokenSchema = z.object({
  deviceId: z.string().min(1).max(255),
  pushToken: z.string().min(1).max(255),
  platform: z.enum(["ios", "android"]),
});

export const unregisterPushTokenSchema = z.object({
  deviceId: z.string().min(1).max(255),
});
