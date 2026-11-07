"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks";
import { setPageLanguage } from "@/lib/auto-translate";

export const LANGUAGE_KEY = "pact.language";
export const LANGUAGE_EVENT = "pact-language";

const stored = (): string | null => {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * Remembers the language in this browser (so Log in and Sign-up use it before there is a session)
 * and tells every screen. Settings > Reading and Sign-up step 2 also save it to the person's settings.
 */
export function rememberLanguage(code: string | null) {
  try {
    if (code) window.localStorage.setItem(LANGUAGE_KEY, code);
    else window.localStorage.removeItem(LANGUAGE_KEY);
  } catch {
    /* storage blocked: this page still switches */
  }
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: code }));
}

/** Translates the whole app into the chosen language, on every screen (lib/auto-translate.ts). */
export function PageLanguage() {
  const { data } = useSettings();
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    setLocal(stored());
    const on = (e: Event) => setLocal((e as CustomEvent<string | null>).detail);
    window.addEventListener(LANGUAGE_EVENT, on);
    return () => window.removeEventListener(LANGUAGE_EVENT, on);
  }, []);

  // Saved settings win once they load; keep the browser copy in step for the next Log in.
  const code = data ? (data.translation ?? null) : local;
  useEffect(() => {
    if (data) {
      try {
        if (data.translation) window.localStorage.setItem(LANGUAGE_KEY, data.translation);
        else window.localStorage.removeItem(LANGUAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [data]);

  useEffect(() => {
    void setPageLanguage(code);
  }, [code]);
  return null;
}
