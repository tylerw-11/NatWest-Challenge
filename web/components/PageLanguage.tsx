"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks";
import { setPageLanguage } from "@/lib/auto-translate";

export const LANGUAGE_KEY = "pact.language";
export const LANGUAGE_EVENT = "pact-language";
const OFF = "off";

const stored = (): string | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * Remembers the language in this browser and tells every screen. Every picker (Log in,
 * Settings, Sign-up step 2) calls this, so the choice persists across screens, reloads and
 * logging in or out. Settings also save it to the person's account.
 */
export function rememberLanguage(code: string | null) {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, code ?? OFF);
  } catch {
    /* storage blocked: this page still switches */
  }
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: code }));
}

/** Translates the whole app into the chosen language, on every screen (lib/auto-translate.ts). */
export function PageLanguage() {
  const { data } = useSettings();
  // The browser's choice wins (read straight away, so no screen flashes English); the account's
  // saved language is used only when this browser has never chosen.
  const [local, setLocal] = useState<string | null>(() => stored());

  useEffect(() => {
    setLocal(stored());
    const on = (e: Event) => setLocal((e as CustomEvent<string | null>).detail ?? OFF);
    window.addEventListener(LANGUAGE_EVENT, on);
    return () => window.removeEventListener(LANGUAGE_EVENT, on);
  }, []);

  const code = local === OFF ? null : (local ?? data?.translation ?? null);

  useEffect(() => {
    void setPageLanguage(code);
  }, [code]);
  return null;
}
