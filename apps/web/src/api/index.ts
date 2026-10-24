import { createHttpClient, type ApiClient } from "./client";
import { createMockClient } from "./mock";

// Backend case routes are not implemented yet, so the in-browser fixture mock
// is the default. Build with VITE_LABELBRIDGE_API=http to use the real API.
export const api: ApiClient =
  import.meta.env.VITE_LABELBRIDGE_API === "http"
    ? createHttpClient()
    : createMockClient();
