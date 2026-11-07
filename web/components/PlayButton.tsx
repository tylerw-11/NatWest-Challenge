"use client";

import { speak, stopSpeaking, useSpeaking } from "@/lib/read-aloud";
import { cn } from "@/lib/utils";
import { PauseIcon, PlayIcon } from "./icons";

/** ▶ / ⏸ for a spoken note. Shows its "on" state while playing. */
export function PlayButton({
  id,
  text,
  label,
  tone = "primary",
  size = "md",
}: {
  id: string;
  text: string;
  label: string;
  tone?: "primary" | "storm";
  size?: "md" | "lg";
}) {
  const playing = useSpeaking(id);
  return (
    <button
      type="button"
      aria-label={playing ? `Stop: ${label}` : label}
      aria-pressed={playing}
      onClick={() => (playing ? stopSpeaking() : speak(text, id, "en-GB", "note"))}
      className={cn(
        "ix ix-press-sm inline-flex shrink-0 items-center justify-center rounded-full text-on-primary",
        size === "lg" ? "size-14" : "size-12",
        tone === "primary" ? "bg-primary hover:bg-primary-hover" : "bg-storm-label hover:opacity-90",
        playing && "animate-live",
      )}
    >
      {playing ? <PauseIcon size={20} fill="currentColor" aria-hidden /> : <PlayIcon size={20} fill="currentColor" aria-hidden />}
    </button>
  );
}
