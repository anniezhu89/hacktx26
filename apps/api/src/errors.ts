import type { NextFunction, Request, Response } from "express";
import { apiError, errorCodes } from "@labelbridge/contracts";

export type ErrorCode = ReturnType<typeof errorCodes.parse>;
export type Infer<T extends { parse: (value: unknown) => unknown }> =
  ReturnType<T["parse"]>;

const statusFor: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  STATE_CONFLICT: 409,
  EXPIRED: 410,
  IMAGE_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE: 415,
  NEEDS_CLARIFICATION: 422,
  INVALID_OUTPUT: 422,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 404,
  INTERNAL_ERROR: 500,
};

const retryableCodes = new Set<ErrorCode>([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

// Messages must never contain request bodies, label text or stack traces.
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = statusFor[code],
  ) {
    super(message);
  }
}

export function sendError(res: Response, error: ApiError) {
  res.status(error.status).json(
    apiError.parse({
      error: {
        code: error.code,
        message: error.message,
        retryable: retryableCodes.has(error.code),
        requestId: res.locals.requestId,
      },
    }),
  );
}

type SafeParser<T> = {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false };
};

export function parseBody<T>(schema: SafeParser<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new ApiError(
      "BAD_REQUEST",
      "Request body does not match the API contract.",
    );
  return result.data;
}

type BodyParserError = { type?: string; status?: number };

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) return next(error);
  if (error instanceof ApiError) return sendError(res, error);
  const parserError = error as BodyParserError;
  if (parserError?.type === "entity.too.large")
    return sendError(
      res,
      new ApiError(
        res.locals.multipart ? "IMAGE_TOO_LARGE" : "BAD_REQUEST",
        res.locals.multipart
          ? "Image exceeds the 5 MB limit."
          : "Request body is too large.",
        413,
      ),
    );
  if (parserError?.type === "entity.parse.failed")
    return sendError(res, new ApiError("BAD_REQUEST", "Malformed JSON body."));
  if (parserError?.status === 400)
    return sendError(res, new ApiError("BAD_REQUEST", "Malformed request."));
  return sendError(
    res,
    new ApiError("INTERNAL_ERROR", "Unexpected server error."),
  );
}
