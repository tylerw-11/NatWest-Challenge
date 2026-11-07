"use client";

/**
 * Read-aloud. First choice: the engine's ElevenLabs voice (POST /speech), whose tone follows the
 * moment on screen (calm mode, mood, storm, rewind...; see engine/speech.py and voice-context.ts).
 * Fallback: the browser speech synthesis API (pact-frontend), when the engine can't be reached,
 * the voice isn't set up, the character budget is used up, or the request fails.
 *
 * One thing speaks at a time; components subscribe with useSpeaking(id) to
 * show their "on" state. Text is chunked (Chrome stops long utterances), a
 * short pause follows cancel() (Chrome can drop an utterance spoken straight
 * after it), and a toast explains when the browser has no voices.
 */
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { voiceContext, voiceLanguage, type VoiceKind } from "./voice-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
/** NEXT_PUBLIC_VOICE=browser turns the ElevenLabs voice off (e.g. offline rehearsal). */
const EXPRESSIVE = process.env.NEXT_PUBLIC_VOICE !== "browser";
let audio: HTMLAudioElement | null = null;
/** After the engine is unreachable or has no voice, stop trying for this page load. */
let expressiveDown = false;

/** Plays the ElevenLabs clip for this text. Resolves true if it is playing (or was superseded). */
async function playExpressive(text: string, mine: number, kind: VoiceKind): Promise<boolean> {
  if (!EXPRESSIVE || expressiveDown || typeof Audio === "undefined") return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API_URL}/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 4000), lang: voiceLanguage(), ...voiceContext(kind) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 503) expressiveDown = true; // no key on the engine
      return false;
    }
    const blob = await res.blob();
    if (mine !== session) return true;
    const url = URL.createObjectURL(blob);
    const clip = new Audio(url);
    audio = clip;
    const done = () => {
      URL.revokeObjectURL(url);
      if (audio === clip) audio = null;
      if (mine === session) emit(null);
    };
    clip.onended = done;
    clip.onerror = done;
    await clip.play();
    return true;
  } catch (e) {
    if (e instanceof TypeError) expressiveDown = true; // engine not running (e.g. mock-only demo)
    return false;
  } finally {
    clearTimeout(timer);
  }
}

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
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (canSpeak()) window.speechSynthesis.cancel();
  emit(null);
}

/**
 * Speak text; `id` names who is speaking so its button can show "on". `kind` tells the voice
 * what it is reading: a screen, the person's own pact note, or a step that just helped.
 */
export async function speak(text: string, id: string, lang = "en-GB", kind: VoiceKind = "page"): Promise<void> {
  stopSpeaking();
  const mine = ++session;
  emit(id);
  if (await playExpressive(text, mine, kind)) return;
  if (mine !== session) return;
  if (!canSpeak()) {
    emit(null);
    toast("Reading aloud isn't available in this browser.");
    return;
  }
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

/** Elements whose text is its own sentence or line when read aloud. */
const BLOCKS = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,label,legend,summary,button,a,td,th,figcaption,blockquote,[role='status'],[role='alert']";

/**
 * Visible text of the page's <main>, as sentences: each heading, paragraph, row and button
 * becomes its own sentence, so the voice pauses between them instead of running words
 * together ("Safety buffer. 6 days." not "Safety buffer6 days"). Skips aria-hidden parts,
 * [data-no-read], hidden text, and repeated lines.
 */
export function mainText(): string {
  const main = document.querySelector("main");
  if (!main) return "";
  const clone = main.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[aria-hidden='true'], [data-no-read], .sr-only, [hidden], script, style, svg").forEach((n) => n.remove());
  const BREAK = "\n";
  clone.querySelectorAll(BLOCKS).forEach((el) => {
    el.prepend(document.createTextNode(BREAK));
    el.append(document.createTextNode(BREAK));
  });
  // Separate inline siblings that sit side by side as separate facts (label and value in a tile).
  clone.querySelectorAll("div > span, div > b, div > strong").forEach((el) => el.append(document.createTextNode(BREAK)));
  const seen = new Set<string>();
  return (clone.textContent ?? "")
    .split(BREAK)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && /[\p{L}\p{N}]/u.test(line) && !seen.has(line) && seen.add(line))
    .map((line) => (/[.!?…:。！？؟।]$/.test(line) ? line : `${line}.`))
    .join(" ");
}
