import http from "node:http";
import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { pool } from "@/db/pool";
import { initSockets } from "@/sockets/index";
import { startTimeoutEngine } from "@/jobs/timeout-engine";

async function main() {
  // Fail startup before the host marks this instance healthy if database
  // credentials, networking, or TLS are misconfigured.
  await pool.query("select 1");
  const app = createApp();
  const httpServer = http.createServer(app);

  initSockets(httpServer);
  const timeoutEngineTimer = startTimeoutEngine();

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(env.port, () => {
      httpServer.off("error", reject);
      logger.info(`ResQR API listening on port ${env.port} (${env.nodeEnv})`);
      resolve();
    });
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    clearInterval(timeoutEngineTimer);
    httpServer.close(async () => {
      await pool.end();
      logger.info("Shutdown complete");
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  void pool.end();
  process.exit(1);
});
