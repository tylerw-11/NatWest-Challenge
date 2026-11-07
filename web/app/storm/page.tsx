"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button, Chip, TextLink } from "@/components/Buttons";
import { StormCloudIcon } from "@/components/illustrations";
import { CheckIcon } from "@/components/icons";
import { PlayButton } from "@/components/PlayButton";
import { FallbackCard, Skeleton } from "@/components/Fallback";
import { useMoveToBuffer, usePactNote, usePactRules, useSettings, useSimulate } from "@/lib/hooks";
import { dayLong, gbp, stateLabel } from "@/lib/format";
import type { FiredRule } from "@/lib/contracts";

const DEMO_AS_OF = "2026-03-13";

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

function chip(f: FiredRule, allyName: string | undefined) {
  switch (f.action_kind) {
    case "category_cap":
      return f.left_gbp !== null ? { emoji: "🍔", text: `${gbp(f.left_gbp)} left this week` } : null;
    case "credit_pause_hours":
      return { emoji: "⏸️", text: "Borrowing paused" };
    case "notify_ally":
      return allyName ? { emoji: "🤝", text: `${allyName} knows` } : null;
    default:
      return null; // move_to_buffer is the button; show_note is the note card
  }
}

function Storm() {
  const asOf = useSearchParams().get("as_of") ?? DEMO_AS_OF;
  const sim = useSimulate(asOf);
  const move = useMoveToBuffer();
  const rules = usePactRules();
  const note = usePactNote();
  const settings = useSettings();
  const allyName = settings.data?.ally?.name;
  const told = useRef(false);

  const fired = sim.data?.fired ?? [];
  const allyTold = fired.some((f) => f.action_kind === "notify_ally");

  // The ally gets a storm alert only; show the demo version of it once.
  useEffect(() => {
    if (allyTold && allyName && !told.current) {
      told.current = true;
      toast(`${allyName} got a storm alert. She can't see your spending.`, { icon: "🤝" });
    }
  }, [allyTold, allyName]);

  if (sim.isPending) return <Skeleton />;
  if (sim.isError) return <FallbackCard error={sim.error} onRetry={() => sim.refetch()} />;

  const forecast = move.data ?? sim.data.forecast;
  const storm = sim.data.forecast.days.find((d) => d.state === "storm");
  const best = forecast.best_action;
  const pactOn = (rules.data?.length ?? 0) > 0;
  const chips = fired.map((f) => chip(f, allyName)).filter((c) => c !== null);
  const isPayday = asOf === best.date;
  const after = storm ? move.data?.days.find((d) => d.date === storm.date) : undefined;

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        <StormCloudIcon size={132} className="animate-drop" />
        <p className="text-[16px] text-storm-label">
          {dayLong(asOf)}
          {isPayday && " · payday"}
        </p>
        <h1 className="text-[28px] leading-tight font-bold">
          {storm ? `A storm is ${daysBetween(asOf, storm.date)} days away.` : "No storms ahead."}
          {pactOn && (
            <>
              <br />
              You planned for this.
            </>
          )}
        </h1>
      </div>

      {pactOn && note.data && (
        <section className="rounded-card border-2 border-storm-hero bg-surface p-5">
          <div className="flex items-center gap-4">
            <PlayButton id="note-storm" text={note.data.text} label="Play your note" tone="storm" />
            <h2 className="text-[17px] font-bold">
              <span aria-hidden>💌</span> A note from you
            </h2>
          </div>
          <p className="mt-3 text-[17px] leading-relaxed">&ldquo;{note.data.text}&rdquo;</p>
        </section>
      )}

      {storm && (
        <div aria-live="polite" className="flex flex-col gap-3">
          <Button
            onClick={() => move.mutate(best.amount_gbp)}
            disabled={move.isPending || move.isSuccess}
            className={move.isSuccess ? "disabled:opacity-100" : undefined}
          >
            {move.isSuccess ? (
              <>
                <CheckIcon size={22} strokeWidth={3} aria-hidden className="animate-pop" />
                {`${gbp(best.amount_gbp)} moved to your buffer`}
              </>
            ) : move.isPending ? (
              "Moving…"
            ) : (
              `Move ${gbp(best.amount_gbp)} to my buffer`
            )}
          </Button>
          {after && (
            <p className="animate-week rounded-card bg-surface p-4 text-center text-[16px]">
              Done. {dayLong(storm.date)} now looks <b>{stateLabel(after.state)}</b>.{" "}
              <Link href="/" className="ix font-bold text-primary underline decoration-1 hover:text-primary-hover hover:decoration-2">
                See your weather
              </Link>
            </p>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-bold">Already working for you</h2>
          <div className="flex flex-wrap gap-3">
            {chips.map((c) => (
              <Chip key={c.text} emoji={c.emoji}>
                {c.text}
              </Chip>
            ))}
          </div>
        </section>
      )}

      <Button variant="danger" href="/support?mood=worried">
        <span aria-hidden>🫂</span> I&apos;m not okay
      </Button>
    </>
  );
}

export default function StormPage() {
  return (
    <div className="min-h-dvh bg-storm-bg">
      <header className="flex items-center justify-between px-5 pt-4">
        <span className="text-[16px] font-bold text-storm-label">Storm mode</span>
        <TextLink href="/">Full app</TextLink>
      </header>
      <main className="enter flex flex-col gap-5 px-5 pt-4 pb-10">
        <Suspense fallback={<Skeleton />}>
          <Storm />
        </Suspense>
      </main>
    </div>
  );
}
