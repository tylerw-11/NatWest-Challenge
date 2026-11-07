"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackIcon, SettingsIcon, SpeakerIcon } from "./icons";
import { IconButton } from "./Buttons";
import { readMain, stopSpeaking, isSpeaking } from "@/lib/read-aloud";

export function ReadAloudButton() {
  const [on, setOn] = useState(false);
  return (
    <IconButton
      label={on ? "Stop reading aloud" : "Read this screen aloud"}
      aria-pressed={on}
      onClick={() => {
        if (isSpeaking()) {
          stopSpeaking();
          setOn(false);
        } else {
          readMain();
          setOn(true);
          const poll = setInterval(() => {
            if (!isSpeaking()) {
              setOn(false);
              clearInterval(poll);
            }
          }, 500);
        }
      }}
    >
      <SpeakerIcon size={24} strokeWidth={2} />
    </IconButton>
  );
}

/**
 * Tab screens (Weather, Pact, Rewind, Support): 22 px bold title on the left,
 * 44 px round read-aloud on the right; Weather also gets a Settings button.
 */
export function TabHeader({
  title,
  emoji,
  showSettings = false,
}: {
  title: string;
  emoji?: string;
  showSettings?: boolean;
}) {
  return (
    <header className="flex items-center justify-between px-5 pt-5 pb-2">
      <h1 className="flex items-center gap-2 text-[22px] font-bold">
        {title}
        {emoji && <span aria-hidden>{emoji}</span>}
      </h1>
      <div className="flex gap-2">
        <ReadAloudButton />
        {showSettings && (
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface text-ink"
          >
            <SettingsIcon size={24} strokeWidth={2} />
          </Link>
        )}
      </div>
    </header>
  );
}

/** Sub-screens (Time River, Settings, Sign-up, Account): back arrow + 16 px bold title. */
export function SubHeader({ title, backHref }: { title: string; backHref?: string }) {
  const router = useRouter();
  const cls = "inline-flex size-11 items-center justify-center rounded-full text-ink";
  return (
    <header className="flex items-center gap-2 px-3 pt-3 pb-1">
      {backHref ? (
        <Link href={backHref} aria-label="Back" className={cls}>
          <BackIcon size={26} strokeWidth={2.25} />
        </Link>
      ) : (
        <button type="button" aria-label="Back" onClick={() => router.back()} className={cls}>
          <BackIcon size={26} strokeWidth={2.25} />
        </button>
      )}
      <h1 className="text-[16px] font-bold">{title}</h1>
    </header>
  );
}
