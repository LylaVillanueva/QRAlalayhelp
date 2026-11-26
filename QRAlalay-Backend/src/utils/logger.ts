import pino from "pino";
import { env } from "@/config/env";

export const logger = pino({
  level: env.isProd ? "info" : "debug",
  transport: env.isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
  redact: {
    // Never let OTPs, tokens, or raw phone/email land in log aggregators.
    paths: ["req.headers.authorization", "*.otp", "*.password", "*.token", "*.refreshToken"],
    remove: true,
  },
});
