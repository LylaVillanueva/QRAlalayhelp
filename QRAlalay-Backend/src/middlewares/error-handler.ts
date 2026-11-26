import type { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/errors";
import { logger } from "@/utils/logger";
import { env } from "@/config/env";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

/**
 * Single error-handling middleware for the whole app. Known AppErrors
 * are passed through with their intended status/code. Anything else
 * (unexpected exceptions, DB driver errors, etc.) is logged in full
 * server-side but reduced to a generic message for the client — never
 * leaking stack traces or raw SQL.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err, path: req.path }, "app_error");
    else logger.warn({ code: err.code, path: req.path }, "app_error");

    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  logger.error({ err, path: req.path }, "unhandled_error");
  return res.status(500).json({
    error: {
      code: "INTERNAL",
      message: "Something went wrong. Please try again.",
      // Only ever include internals outside production, for local debugging.
      ...(env.isProd ? {} : { debug: err instanceof Error ? err.message : err }),
    },
  });
}
