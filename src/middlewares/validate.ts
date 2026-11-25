import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "@/utils/errors";

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/** Validates req.body/params/query against Zod schemas, replacing them with the parsed (typed, coerced) values. */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      next();
    } catch (err: any) {
      next(AppError.badRequest("Validation failed", "VALIDATION_ERROR", err?.errors ?? err?.message));
    }
  };
}
