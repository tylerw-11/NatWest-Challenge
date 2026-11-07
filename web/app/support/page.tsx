"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { TabScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Button } from "@/components/Buttons";
import { RowCard } from "@/components/Cards";
import { ChevronIcon, SlidersIcon, UserIcon } from "@/components/icons";
import { useSettings, useUpdateSettings } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const MOODS = [
  { id: "good", emoji: "😊", label: "Good" },
  { id: "unsure", emoji: "😐", label: "Unsure" },
  { id: "worried", emoji: "😟", label: "Worried" },
] as const;

const DEBT_HELP_URL = "https://www.moneyhelper.org.uk/en/money-troubles/dealing-with-debt";

function CheckIn() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const fromStorm = useSearchParams().get("mood") === "worried";
  const mood = settings.data?.mood ?? null;
  const calm = settings.data?.calm_mode ?? false;
  const { mutate } = update;

  // Arriving from "I'm not okay" counts as the user saying they are worried.
  useEffect(() => {
    if (fromStorm) mutate({ mood: "worried" });
  }, [fromStorm, mutate]);

  return (
    <HeroCard
      tone="teal"
      eyebrow="Check in"
      headline="How do you feel about money today?"
      body="However today feels, we're here."
    >
      <div role="group" aria-label="How you feel" className="mt-4 grid grid-cols-3 gap-3">
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mood === m.id}
            onClick={() => update.mutate({ mood: m.id })}
            className={cn(
              "ix ix-press flex min-h-24 flex-col items-center justify-center gap-1 rounded-card border-2 text-[17px] font-bold",
              mood === m.id ? "border-primary bg-surface" : "border-border bg-surface/60 hover:border-ink-2 hover:bg-surface",
            )}
          >
            <span aria-hidden className="text-[32px] leading-none">
              {m.emoji}
            </span>
            {m.label}
          </button>
        ))}
      </div>

      {mood === "worried" && (
        <div aria-live="polite" className="animate-week mt-4 flex flex-col gap-4 rounded-card bg-surface p-5">
          <p className="text-[17px]">
            {calm ? "Calm mode is on. You can turn it off any time." : "Thanks for telling us. Want a calmer app for a while?"}
          </p>
          <Button variant={calm ? "secondary" : "primary"} onClick={() => update.mutate({ calm_mode: !calm })}>
            {calm ? "Turn off calm mode" : "Turn on calm mode"}
          </Button>
        </div>
      )}
      {mood && mood !== "worried" && (
        <p aria-live="polite" className="mt-4 text-[16px]">
          Thanks for telling us.
        </p>
      )}
    </HeroCard>
  );
}

export default function SupportPage() {
  const demo = (what: string) => toast(`In the full app this opens ${what}.`);
  return (
    <TabScreen title="Support" emoji="💛">
      <Suspense>
        <CheckIn />
      </Suspense>

      <h2 className="mt-2 text-[20px] font-bold">Talk to someone</h2>
      <div className="grid grid-cols-2 gap-4">
        {[
          { emoji: "💬", label: "Message us", what: "a chat with our team" },
          { emoji: "📞", label: "Book a call back", what: "a call back booking" },
        ].map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => demo(t.what)}
            className="ix ix-lift ix-press flex min-h-24 flex-col items-center justify-center gap-2 rounded-card border border-border bg-surface text-[17px] font-bold hover:border-ink-2"
          >
            <span aria-hidden className="text-[30px] leading-none">
              {t.emoji}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      <a href={DEBT_HELP_URL} target="_blank" rel="noreferrer">
        <RowCard title="Free, independent debt advice" trailing={<ChevronIcon size={24} aria-hidden />} />
      </a>
      <Link href="/settings">
        <RowCard
          icon={<SlidersIcon size={26} aria-hidden />}
          title="Make Pact work for you"
          subtitle="Reading, alerts, people, colours"
          trailing={<ChevronIcon size={24} aria-hidden />}
        />
      </Link>
      <Link href="/account">
        <RowCard
          icon={<UserIcon size={26} aria-hidden />}
          title="Account"
          subtitle="Login, bank, devices, your data"
          trailing={<ChevronIcon size={24} aria-hidden />}
        />
      </Link>
    </TabScreen>
  );
}
