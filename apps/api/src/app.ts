import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { healthResponse, apiError } from "@labelbridge/contracts";
export function createApp(webRoot = path.resolve("apps/web/dist")) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/api/health", (_req, res) =>
    res.json(
      healthResponse.parse({
        contractVersion: "1",
        requestId: randomUUID(),
        dataMode: "fixture",
        data: {
          status: "ok",
          providers: {
            extraction: "fixture",
            explanation: "fixture",
            search: "fixture",
          },
        },
      }),
    ),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json(
      apiError.parse({
        error: {
          code: "NOT_IMPLEMENTED",
          message: "This endpoint is not implemented in the foundation.",
          retryable: false,
          requestId: randomUUID(),
        },
      }),
    ),
  );
  app.use(express.static(webRoot));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(webRoot, "index.html")),
  );
  return app;
}
