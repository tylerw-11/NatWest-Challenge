/**
 * Typed fetch helpers. Every response is parsed with Zod. With USE_MOCKS=true
 * (the default until the engine is up) data comes from web/mocks instead.
 */
import { z } from "zod";
import { ApiErrorBody, Forecast, Me, PactRules, Rewind, Settings } from "./contracts";
import forecastMock from "@/mocks/forecast.json";
import rewindMock from "@/mocks/rewind.json";
import settingsMock from "@/mocks/settings.json";
import meMock from "@/mocks/me.json";
import pactMock from "@/mocks/pact.json";

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public code: string,
    public message_plain: string,
  ) {
    super(message_plain);
  }
}

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

/** Mocks are parsed too, so a bad mock fails the same way a bad engine would. */
function mock<T>(schema: z.ZodType<T>, data: unknown): Promise<T> {
  return Promise.resolve(schema.parse(data));
}

export const api = {
  forecast: () =>
    USE_MOCKS ? mock(Forecast, forecastMock) : request(Forecast, "/forecast"),
  rewind: () =>
    USE_MOCKS ? mock(Rewind, rewindMock) : request(Rewind, "/rewind"),
  settings: () =>
    USE_MOCKS ? mock(Settings, settingsMock) : request(Settings, "/settings"),
  me: () => (USE_MOCKS ? mock(Me, meMock) : request(Me, "/me")),
  pactRules: () =>
    USE_MOCKS ? mock(PactRules, pactMock) : request(PactRules, "/pact"),
};
