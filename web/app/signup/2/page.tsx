"use client";

import { LanguagePicker } from "@/components/LanguagePicker";
import { useRouter } from "next/navigation";
import { SubScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Cards";
import { Button, TextLink } from "@/components/Buttons";
import { useForecast, useSettings, useUpdateSettings } from "@/lib/hooks";
import type { ColourMode, Forecast, ReadingLevel } from "@/lib/contracts";
import { cn } from "@/lib/utils";


const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

/** The same fact at three reading levels, all from the forecast. */
/**
 * A new person has no forecast until step 3, so these show the three levels without figures
 * (every number on screen must come from the engine).
 */
const GENERIC: { level: ReadingLevel; label: string; text: string }[] = [
  { level: "simple", label: "Simple", text: "You're fine this week." },
  { level: "clear", label: "Clear", text: "You're covered this week. Next week may be tight." },
  {
    level: "detailed",
    label: "Detailed",
    text: "Your balance is likely to stay above £0 this week. Next week has a higher chance of going short.",
  },
];

function examples(f: Forecast): { level: ReadingLevel; label: string; text: string }[] {
  const until = f.covered_until;
  const p = f.days.find((d) => d.date === until)?.p_shortfall ?? 0;
  const inTen = Math.round((1 - p) * 10);
  return [
    { level: "simple", label: "Simple", text: `You're good until ${fmt(until, { weekday: "long" })}.` },
    {
      level: "clear",
      label: "Clear",
      text: `You're covered until ${fmt(until, { weekday: "long", day: "numeric", month: "long" })}.`,
    },
    {
      level: "detailed",
      label: "Detailed",
      text: `Your balance stays above £0 until ${fmt(until, { day: "numeric", month: "long" })} in ${inTen} of 10 forecasts.`,
    },
  ];
}

export default function SignupStep2() {
  const router = useRouter();
  const forecast = useForecast();
  const settings = useSettings();
  const update = useUpdateSettings();
  const s = settings.data;

  return (
    <SubScreen title="Step 2 of 3" backHref="/login">
      <div aria-label="Step 2 of 3" role="img" className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("h-2 rounded-full", n <= 2 ? "bg-primary" : "bg-divider")} />
        ))}
      </div>

      <HeroCard
        tone="teal"
        eyebrow="Make it yours"
        headline="How should Pact talk to you?"
        body="Change it any time."
        icon={<span aria-hidden className="text-[60px] leading-none">🗣️</span>}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[18px] font-bold">Pick the one that reads best</legend>
        {(forecast.data ? examples(forecast.data) : forecast.isPending ? [] : GENERIC).map((e) => {
            const on = s?.reading_level === e.level;
            return (
              <label
                key={e.level}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-card border-2 bg-surface px-5 py-4 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-primary",
                  "ix ix-press",
                  on ? "border-primary" : "border-border hover:border-ink-2",
                )}
              >
                <input
                  type="radio"
                  name="reading"
                  className="sr-only"
                  checked={on}
                  onChange={() => update.mutate({ reading_level: e.level })}
                />
                <span className={cn("text-[14px] font-bold uppercase", on ? "text-primary" : "text-ink-2")}>
                  {e.label}
                </span>
                <span className="text-[17px]">{e.text}</span>
              </label>
            );
          })}
      </fieldset>

      {s && (
        <Card className="py-2">
          <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-divider">
            <span aria-hidden>🔊</span>
            <span className="flex-1 text-[18px]">Read screens aloud</span>
            <input
              type="checkbox"
              checked={s.read_aloud}
              onChange={(e) => update.mutate({ read_aloud: e.target.checked })}
              className="size-7 accent-primary"
            />
          </label>
          <div className="flex min-h-16 items-center gap-3 border-b border-divider">
            <span aria-hidden>🎨</span>
            <label htmlFor="colours" className="flex-1 text-[18px]">
              Colours
            </label>
            <select
              id="colours"
              value={s.colour_mode}
              onChange={(e) => update.mutate({ colour_mode: e.target.value as ColourMode })}
              className="min-h-12 rounded-2xl border border-ink-2 bg-surface px-4 text-[17px]"
            >
              <option value="standard">Standard</option>
              <option value="colour_blind">Colour-blind friendly</option>
              <option value="high_contrast">High contrast</option>
            </select>
          </div>
          <div className="flex min-h-16 items-start gap-3 py-2">
            <span aria-hidden className="pt-1 text-[18px]">🌍</span>
            <LanguagePicker
              id="translation"
              label="Translation"
              value={s.translation}
              onChange={(code) => update.mutate({ translation: code })}
            />
          </div>
        </Card>
      )}

      <Button onClick={() => router.push("/signup/3")}>Next</Button>
      <div className="text-center">
        <TextLink href="/">Skip for now</TextLink>
      </div>
    </SubScreen>
  );
}
