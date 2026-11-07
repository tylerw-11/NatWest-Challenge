/**
 * Typed fetch helpers. Every response is parsed with Zod. With USE_MOCKS=true
 * (the default until the engine is up) data comes from lib/mockApi.ts: the demo
 * figures in web/mocks/*.json, or the scenario picked on /dev/scenarios or with
 * ?scenario=<name> (decision 0001, item 5).
 */
import { z } from "zod";
import { ApiErrorBody, Forecast, Me, PactRules, Rewind, Settings } from "./contracts";
import { ApiError } from "./errors";
import { mockApi } from "./mockApi";

export { ApiError };

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FALLBACK_ERROR = new ApiError(
  "network",
  "We could not load this right now. Please try again.",
);

async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw FALLBACK_ERROR;
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiErrorBody.safeParse(body);
    throw err.success
      ? new ApiError(err.data.code, err.data.message_plain)
      : FALLBACK_ERROR;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error(`Contract mismatch on ${path}`, parsed.error.issues);
    throw new ApiError("contract", "Something looks wrong with this data.");
  }
  return parsed.data;
}

/** Mocks are parsed with the same schemas, so a bad mock fails the same way a bad engine would. */
export const api = {
  forecast: () => (USE_MOCKS ? mockApi.forecast() : request(Forecast, "/forecast")),
  rewind: () => (USE_MOCKS ? mockApi.rewind() : request(Rewind, "/rewind")),
  settings: () => (USE_MOCKS ? mockApi.settings() : request(Settings, "/settings")),
  me: () => (USE_MOCKS ? mockApi.me() : request(Me, "/me")),
  pactRules: () => (USE_MOCKS ? mockApi.pactRules() : request(PactRules, "/pact")),
};
