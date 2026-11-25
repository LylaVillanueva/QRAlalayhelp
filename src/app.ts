import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import routes from "@/routes/index";
import { errorHandler, notFoundHandler } from "@/middlewares/error-handler";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Only trust the configured number of known reverse-proxy hops. Trusting
  // arbitrary forwarded headers makes IP-based rate limits spoofable.
  app.set("trust proxy", env.trustProxyHops);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin/non-browser requests (curl, mobile native HTTP
        // clients) send no Origin header at all — allow those through;
        // browser requests are restricted to the dashboard's origin.
        // Native app bundle IDs are validated separately via a custom
        // header check below, since bundle IDs aren't part of CORS.
        if (!origin || [env.cors.webDashboardOrigin, env.web.publicOrigin].includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use((req, res, next) => {
    // Lightweight allow-list for native mobile clients, which identify
    // themselves via a custom header rather than Origin.
    const bundleId = req.headers["x-app-bundle-id"];
    if (bundleId && !env.cors.mobileBundleIds.includes(String(bundleId))) {
      return res.status(403).json({ error: { code: "UNKNOWN_CLIENT", message: "Unrecognized client" } });
    }
    next();
  });

  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(pinoHttp({ logger, autoLogging: !env.isProd }));

  // API responses can include resident, medical, account, and location data.
  // Keep browsers and shared proxies from caching those responses.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
