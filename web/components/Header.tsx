"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackIcon, SettingsIcon, SpeakerIcon, StopIcon } from "./icons";
import { IconButton } from "./Buttons";
import { mainText, speak, stopSpeaking, useSpeaking } from "@/lib/read-aloud";
import { currentLanguage } from "@/lib/voice-context";
import { cn } from "@/lib/utils";

export function ReadAloudButton() {
  const on = useSpeaking("page");
  return (
    <IconButton
      label={on ? "Stop reading aloud" : "Read this screen aloud"}
      aria-pressed={on}
      onClick={() => (on ? stopSpeaking() : speak(mainText(), "page", currentLanguage() ?? "en-GB"))}
      className={cn(on && "animate-live border-primary bg-primary text-on-primary hover:bg-primary-hover")}
    >
      {on ? <StopIcon size={18} fill="currentColor" /> : <SpeakerIcon size={24} strokeWidth={2} />}
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
  logo = false,
}: {
  title: string;
  emoji?: string;
  showSettings?: boolean;
  /** The Pact app icon in the top-left corner (Weather, the home screen). */
  logo?: boolean;
}) {
  return (
    <header className="flex items-center justify-between px-5 pt-5 pb-2">
      <h1 className="flex items-center gap-2 text-[22px] font-bold">
        {logo && <Image src="/brand/pact-icon.png" alt="Pact" width={40} height={40} priority className="size-10 rounded-xl" />}
        {title}
        {emoji && <span aria-hidden>{emoji}</span>}
      </h1>
      <div className="flex gap-2">
        <ReadAloudButton />
        {showSettings && (
          <Link
            href="/settings"
            aria-label="Settings"
            className="ix ix-press-sm inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface text-ink hover:border-ink-2 hover:bg-surface-hover"
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
  const cls = "ix ix-press-sm inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface-hover";
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
