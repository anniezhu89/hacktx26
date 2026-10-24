import { createHttpClient, type ApiClient } from "./client";
import { createMockClient } from "./mock";

// The backend serves case routes. Build with VITE_LABELBRIDGE_API=mock to use
// the in-browser fixture mock instead (labeled on screen).
export const api: ApiClient =
  import.meta.env.VITE_LABELBRIDGE_API === "mock"
    ? createMockClient()
    : createHttpClient();
