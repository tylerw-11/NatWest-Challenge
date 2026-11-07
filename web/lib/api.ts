/**
 * Typed fetch helpers. Every response is parsed with Zod. With USE_MOCKS=true
 * (the default until the engine is up) data comes from web/mocks and the
 * in-browser mock store instead.
 */
import { z } from "zod";
import {
  ApiErrorBody,
  Forecast,
  Me,
  PactNote,
  PactRules,
  Rewind,
  Settings,
  SimulateResult,
  type PactRule,
} from "./contracts";
import { getMockState, setMockState } from "./mock-store";
import forecastMock from "@/mocks/forecast.json";
import forecastSimulatedMock from "@/mocks/forecast_simulated.json";
import forecastAfterMock from "@/mocks/forecast_after.json";
import simulateMock from "@/mocks/simulate.json";
import rewindMock from "@/mocks/rewind.json";
import meMock from "@/mocks/me.json";
import pactDraftMock from "@/mocks/pact_draft.json";
import pactNoteMock from "@/mocks/pact_note.json";

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

const FALLBACK_ERROR = new ApiError("network", "We could not load this right now. Please try again.");

async function request<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
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
    throw err.success ? new ApiError(err.data.code, err.data.message_plain) : FALLBACK_ERROR;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error(`Contract mismatch on ${path}`, parsed.error.issues);
    throw new ApiError("contract", "Something looks wrong with this data.");
  }
  return parsed.data;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/** Mocks are parsed too, so a bad mock fails the same way a bad engine would. */
function mock<T>(schema: z.ZodType<T>, data: unknown, delay = 120): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      const r = schema.safeParse(data);
      if (r.success) resolve(r.data);
      else {
        console.error("Mock does not match contract", r.error.issues);
        reject(new ApiError("contract", "Something looks wrong with this data."));
      }
    }, delay),
  );
}

/** The forecast the mock engine would return at the current demo stage. */
function stageForecast(): unknown {
  const { stage } = getMockState();
  return stage === "after_move" ? forecastAfterMock : stage === "simulated" ? forecastSimulatedMock : forecastMock;
}

export const api = {
  forecast: () => (USE_MOCKS ? mock(Forecast, stageForecast()) : request(Forecast, "/forecast")),

  /** Demo fast-forward: re-runs the forecast as of a date and fires confirmed rules. */
  simulate: (asOf: string) => {
    if (USE_MOCKS) {
      const { stage, rules } = getMockState();
      if (stage === "base") setMockState({ stage: "simulated" });
      const confirmed = new Set(rules.filter((r) => r.confirmed).map((r) => r.id));
      return mock(SimulateResult, {
        forecast: stageForecast(),
        fired: simulateMock.fired.filter((f) => confirmed.has(f.rule_id)),
      });
    }
    return request(SimulateResult, `/simulate?as_of=${asOf}`, { method: "POST" });
  },

  /** The one storm-mode action. Returns the re-run forecast. */
  moveToBuffer: (amount_gbp: number) => {
    if (USE_MOCKS) {
      setMockState({ stage: "after_move" });
      return mock(Forecast, stageForecast(), 400);
    }
    return request(Forecast, "/actions/move-to-buffer", post({ amount_gbp }));
  },
  rewind: () => (USE_MOCKS ? mock(Rewind, rewindMock) : request(Rewind, "/rewind")),
  settings: () => (USE_MOCKS ? mock(Settings, getMockState().settings) : request(Settings, "/settings")),
  me: () => (USE_MOCKS ? mock(Me, meMock) : request(Me, "/me")),
  pactRules: () => (USE_MOCKS ? mock(PactRules, getMockState().rules) : request(PactRules, "/pact")),
  pactNote: () =>
    USE_MOCKS
      ? mock(PactNote, getMockState().note ?? pactNoteMock)
      : request(PactNote, "/pact/note"),

  /** Claude turns free text into draft rules from the closed action list. */
  parsePact: (text: string) =>
    USE_MOCKS ? mock(PactRules, pactDraftMock, 600) : request(PactRules, "/pact/parse", post({ text })),

  /** Stores only the rules the user confirmed (the AI proposes, the user confirms). */
  savePact: (rules: PactRule[]) => {
    const confirmed = rules.map((r) => ({ ...r, confirmed: true }));
    if (USE_MOCKS) {
      setMockState({ rules: confirmed });
      return mock(PactRules, confirmed);
    }
    return request(PactRules, "/pact", post({ rules: confirmed }));
  },

  saveNote: (note: PactNote) => {
    if (USE_MOCKS) {
      setMockState({ note });
      return mock(PactNote, note);
    }
    return request(PactNote, "/pact/note", post(note));
  },
};
