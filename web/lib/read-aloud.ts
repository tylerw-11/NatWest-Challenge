"use client";

/**
 * Read-aloud with the browser speech synthesis API (pact-frontend).
 * One thing speaks at a time; components subscribe with useSpeaking(id) to
 * show their "on" state. Text is chunked (Chrome stops long utterances), a
 * short pause follows cancel() (Chrome can drop an utterance spoken straight
 * after it), and a toast explains when the browser has no voices.
 */
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

let currentId: string | null = null;
let session = 0;
const listeners = new Set<() => void>();

function emit(id: string | null) {
  currentId = id;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** True while the speaker with this id is talking. */
export function useSpeaking(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => currentId === id,
    () => false,
  );
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    const t = setTimeout(done, 1200);
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(t);
        done();
      },
      { once: true },
    );
  });
}

function chunks(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.length + p.length < 180) out[out.length - 1] = `${last} ${p}`;
    else out.push(p);
  }
  return out;
}

export function stopSpeaking() {
  session++;
  if (canSpeak()) window.speechSynthesis.cancel();
  emit(null);
}

/** Speak text; `id` names who is speaking so its button can show "on". */
export async function speak(text: string, id: string, lang = "en-GB"): Promise<void> {
  if (!canSpeak()) {
    toast("Reading aloud isn't available in this browser.");
    return;
  }
  stopSpeaking();
  const mine = ++session;
  emit(id);
  const voices = await voicesReady();
  if (mine !== session) return;
  if (!voices.length) {
    emit(null);
    toast("Reading aloud isn't available in this browser.");
    return;
  }
  await new Promise((r) => setTimeout(r, 80));
  if (mine !== session) return;

  const voice =
    voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
  const parts = chunks(text);
  window.speechSynthesis.resume();
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = lang;
    u.voice = voice;
    u.rate = 0.95;
    if (i === parts.length - 1) {
      u.onend = () => mine === session && emit(null);
    }
    u.onerror = (e) => {
      if (mine === session && e.error !== "interrupted" && e.error !== "canceled") emit(null);
    };
    window.speechSynthesis.speak(u);
  });
}

/** Visible text of the page's <main>, skipping aria-hidden parts. */
export function mainText(): string {
  const main = document.querySelector("main");
  if (!main) return "";
  const clone = main.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[aria-hidden='true'], [data-no-read], .sr-only").forEach((n) => n.remove());
  return clone.textContent ?? "";
}
