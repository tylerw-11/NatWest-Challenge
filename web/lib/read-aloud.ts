"use client";

/** Read-aloud uses the browser speech synthesis API (pact-frontend). */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSpeaking(): boolean {
  return canSpeak() && window.speechSynthesis.speaking;
}

export function speak(text: string, lang = "en-GB") {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Reads the visible text of the page's <main>, skipping aria-hidden parts. */
export function readMain() {
  const main = document.querySelector("main");
  if (!main) return;
  const clone = main.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[aria-hidden='true'], [data-no-read]").forEach((n) => n.remove());
  speak(clone.innerText.replace(/\s+\n/g, "\n"));
}
