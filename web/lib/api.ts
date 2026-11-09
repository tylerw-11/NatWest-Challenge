/**
 * Typed fetch helpers. Every response is parsed with Zod. With USE_MOCKS=true
 * (the default until the engine is up) data comes from web/mocks and the
 * in-browser mock store instead. If a test scenario other than "demo" is picked
 * on /dev/scenarios (or with ?scenario=), the read calls come from lib/mockApi.ts
 * instead, so every screen can be checked against it (decision 0001, item 5).
 */
import { z } from "zod";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  ApiErrorBody,
  CodeRequestResult,
  Profile,
  VerifyResult,
  Forecast,
  Me,
  PactNote,
  PactRules,
  Rewind,
  Settings,
  SimulateResult,
  type PactRule,
  type Profile as ProfileT,
  type Settings as SettingsT,
} from "./contracts";
import { ApiError } from "./errors";
import { currentScenario, mockApi } from "./mockApi";
import { rememberForecast, rememberSettings } from "./voice-context";
import { engineUrl } from "./engine-url";
import { getMockState, setMockState } from "./mock-store";
import forecastMock from "@/mocks/forecast.json";
import forecastSimulatedMock from "@/mocks/forecast_simulated.json";
import forecastAfterMock from "@/mocks/forecast_after.json";
import simulateMock from "@/mocks/simulate.json";
import rewindMock from "@/mocks/rewind.json";
import { generateMockDemoHistory } from "@/mocks/demo-history";
import meMock from "@/mocks/me.json";
import pactDraftMock from "@/mocks/pact_draft.json";
import pactNoteMock from "@/mocks/pact_note.json";

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";

export { ApiError };

/** True when a test scenario (not the demo) is chosen; the demo keeps Roh's staged mock flow. */
const testScenario = () => USE_MOCKS && currentScenario().name !== "demo";

const FALLBACK_ERROR = new ApiError("network", "We could not load this right now. Please try again.");

/**
 * Live engine only: a logged-out visitor goes to Log in. (A new person without money details
 * sees the plain "Add your money details" card instead, so "Skip for now" still works.)
 */
function redirectFor(status: number, code?: string) {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path.startsWith("/login") || path.startsWith("/dev")) return;
  if (status === 401) window.location.assign("/login");
  if (status === 404 && code === "no_profile" && !path.startsWith("/signup")) window.location.assign("/signup/3");
}

async function request<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(engineUrl(path), {
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
    if (err.success) redirectFor(res.status, err.data.code);
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

const Ok = z.null();
const AccountSession = z.object({
  id: z.string(),
  device_label: z.string().nullable(),
  created_at: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});
const AccountSessions = z.array(AccountSession);
const DeleteRequest = z.object({ scheduled_for: z.string(), cancel_available: z.boolean() });

export const api = {
  /** Demo login: sets the session cookie for Amara. */
  authDemo: () => (USE_MOCKS ? mock(Ok, null, 300) : request(Ok, "/auth/demo", { method: "POST" })),
  logout: () => (USE_MOCKS ? mock(Ok, null, 150) : request(Ok, "/auth/logout", { method: "POST" })),

  forecast: () =>
    (testScenario() ? mockApi.forecast() : USE_MOCKS ? mock(Forecast, stageForecast()) : request(Forecast, "/forecast")).then(
      rememberForecast,
    ),

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
      return mock(Forecast, stageForecast(), 400).then(rememberForecast);
    }
    // The button press is the confirmation (invariant 2); the engine refuses a move without it.
    return request(Forecast, "/actions/move-to-buffer", post({ amount_gbp, confirmed: true })).then(rememberForecast);
  },
  rewind: () =>
    testScenario()
      ? mockApi.rewind()
      : USE_MOCKS
        ? mock(Rewind, { ...rewindMock, history: generateMockDemoHistory(), history_is_demo: true })
        : request(Rewind, "/rewind"),
  settings: () =>
    (testScenario()
      ? mockApi.settings()
      : USE_MOCKS
        ? mock(Settings, getMockState().settings)
        : request(Settings, "/settings")
    ).then(rememberSettings),
  me: () => (testScenario() ? mockApi.me() : USE_MOCKS ? mock(Me, meMock) : request(Me, "/me")),

  /** PUT /settings with the fields that changed. */
  updateSettings: (patch: Partial<SettingsT>) => {
    if (USE_MOCKS) {
      const settings = { ...getMockState().settings, ...patch };
      setMockState({ settings });
      return mock(Settings, settings, 60).then(rememberSettings);
    }
    return request(Settings, "/settings", { method: "PUT", body: JSON.stringify(patch) }).then(rememberSettings);
  },
  pactRules: () =>
    testScenario()
      ? mockApi.pactRules()
      : USE_MOCKS
        ? mock(PactRules, getMockState().rules)
        : request(PactRules, "/pact"),
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
  /** Real login, step 1: email a 6-digit code. dev_code only comes back when the engine has no email set up. */
  requestCode: (email: string) =>
    USE_MOCKS
      ? mock(CodeRequestResult, { sent: true, expires_in_s: 600, dev_code: "123456" }, 400)
      : request(CodeRequestResult, "/auth/code/request", post({ email })),

  /** Real login, step 2: check the code. Sets the session cookie. */
  verifyCode: (email: string, code: string) => {
    if (USE_MOCKS) {
      return code === "123456"
        ? mock(VerifyResult, { new_user: true }, 300)
        : Promise.reject(new ApiError("wrong_code", "That code is not right. Check it and try again."));
    }
    return request(VerifyResult, "/auth/code/verify", post({ email, code }));
  },

  /** Face ID / Windows Hello / Touch ID login with a passkey (WebAuthn). */
  passkeyLogin: async () => {
    if (USE_MOCKS) return mock(VerifyResult, { new_user: false }, 300);
    const optionsJSON = await request(z.any(), "/auth/passkey/login/options", post({}));
    const credential = await startAuthentication({ optionsJSON });
    return request(VerifyResult, "/auth/passkey/login/verify", post({ credential }));
  },

  /** Turn on Face ID for this device (needs a session). */
  registerPasskey: async () => {
    if (USE_MOCKS) return mock(z.object({ registered: z.boolean() }), { registered: true }, 300);
    const optionsJSON = await request(z.any(), "/auth/passkey/register/options", post({}));
    const credential = await startRegistration({ optionsJSON });
    return request(z.object({ registered: z.boolean() }), "/auth/passkey/register/verify", post({ credential }));
  },

  /** A real person's numbers. 404 not_found until they have set them up. */
  profile: () =>
    USE_MOCKS
      ? Promise.reject(new ApiError("not_found", "You have not added your numbers yet."))
      : request(Profile, "/profile"),

  /** Save a real person's numbers; GET /forecast then forecasts from them, as of today. */
  saveProfile: (profile: ProfileT) =>
    USE_MOCKS
      ? mock(Profile, profile, 300)
      : request(Profile, "/profile", { method: "PUT", body: JSON.stringify(profile) }),

  /** Database-backed account controls. */
  accountSessions: () => (USE_MOCKS ? mock(AccountSessions, []) : request(AccountSessions, "/account/sessions")),
  removeSession: (sessionId: string) =>
    USE_MOCKS
      ? mock(Ok, null, 100)
      : request(Ok, `/account/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
  exportAccount: () =>
    USE_MOCKS
      ? mock(z.any(), { user_id: "amara", data: { settings: getMockState().settings, pact_rules: getMockState().rules, pact_notes: getMockState().note ? [getMockState().note] : [] } })
      : request(z.any(), "/account/export"),
  requestAccountDelete: () =>
    USE_MOCKS
      ? mock(DeleteRequest, { scheduled_for: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), cancel_available: true })
      : request(DeleteRequest, "/account/delete", post({})),
  cancelAccountDelete: () =>
    USE_MOCKS
      ? mock(z.object({ cancelled: z.boolean() }), { cancelled: true })
      : request(z.object({ cancelled: z.boolean() }), "/account/delete/cancel", post({})),
};
