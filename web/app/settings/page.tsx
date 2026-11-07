"use client";

import { LanguagePicker } from "@/components/LanguagePicker";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SubScreen } from "@/components/Screen";
import { Card } from "@/components/Cards";
import { Button } from "@/components/Buttons";
import { Skeleton } from "@/components/Fallback";
import { useSettings, useUpdateSettings } from "@/lib/hooks";
import type { ColourMode, ReadingLevel, Settings } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "reading", emoji: "📖", label: "Reading" },
  { id: "alerts", emoji: "🔔", label: "Alerts" },
  { id: "people", emoji: "🤝", label: "People" },
  { id: "colours", emoji: "🎨", label: "Colours" },
] as const;
type TabId = (typeof TABS)[number]["id"];


type Update = (patch: Partial<Settings>) => void;

function RadioCard<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; hint?: string; swatch?: string[] }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="rounded-card border border-border bg-surface px-5 pt-1 pb-3">
      <legend className="px-2 text-[18px] font-bold">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="ix -mx-2 flex min-h-14 cursor-pointer items-center gap-4 rounded-xl px-2 hover:bg-surface-hover">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="size-6 shrink-0 accent-primary"
          />
          <span className="flex-1 text-[18px]">
            {o.label}
            {o.hint && <span className="ml-3 text-[15px] text-ink-2">{o.hint}</span>}
          </span>
          {o.swatch && (
            <span aria-hidden className="flex gap-1">
              {o.swatch.map((c) => (
                <span key={c} className="size-5 rounded-full border border-divider" style={{ background: c }} />
              ))}
            </span>
          )}
        </label>
      ))}
    </fieldset>
  );
}

function ReadingPanel({ s, update }: { s: Settings; update: Update }) {
  return (
    <>
      <RadioCard<ReadingLevel>
        legend="How we explain things"
        name="reading"
        value={s.reading_level}
        onChange={(v) => update({ reading_level: v })}
        options={[
          { value: "simple", label: "Simple", hint: "short words" },
          { value: "clear", label: "Clear" },
          { value: "detailed", label: "Detailed" },
        ]}
      />
      <Card className="py-2">
        <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-divider">
          <span aria-hidden>🔊</span>
          <span className="flex-1 text-[18px]">Read screens aloud</span>
          <input
            type="checkbox"
            checked={s.read_aloud}
            onChange={(e) => update({ read_aloud: e.target.checked })}
            className="size-7 accent-primary"
          />
        </label>
        <div className="flex min-h-16 items-start gap-3 py-2">
          <span aria-hidden className="pt-1 text-[18px]">🌍</span>
          <LanguagePicker
            id="translation"
            label="Translation"
            value={s.translation}
            onChange={(code) => update({ translation: code })}
          />
        </div>
      </Card>
    </>
  );
}

function AlertsPanel({ s, update }: { s: Settings; update: Update }) {
  return (
    <>
      <RadioCard<string>
        legend="Warn me about a storm"
        name="lead"
        value={String(s.storm_lead_days)}
        onChange={(v) => update({ storm_lead_days: Number(v) as Settings["storm_lead_days"] })}
        options={[
          { value: "14", label: "2 weeks before" },
          { value: "7", label: "1 week before" },
          { value: "0", label: "On the day" },
        ]}
      />
      <p className="px-1 text-[16px] text-ink-2">We only tell you. Nothing moves without your OK.</p>
    </>
  );
}

function PeoplePanel({ s, update }: { s: Settings; update: Update }) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  if (s.ally) {
    return (
      <Card className="flex flex-col gap-4">
        <h2 className="text-[18px] font-bold">Someone you trust</h2>
        <p className="text-[18px]">
          <b>{s.ally.name}</b> · {s.ally.relation}
        </p>
        <p className="text-[16px] text-ink-2">
          Gets storm alerts only. {s.ally.name} can&apos;t see your spending or move money.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            update({ ally: null });
            toast(`${s.ally!.name} won't get alerts any more.`);
          }}
        >
          Remove {s.ally.name}
        </Button>
      </Card>
    );
  }
  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) update({ ally: { name: name.trim(), relation: relation.trim() || "friend" } });
        }}
      >
        <h2 className="text-[18px] font-bold">Add someone you trust</h2>
        <p className="text-[16px] text-ink-2">They get storm alerts only. They never see your spending.</p>
        <label className="flex flex-col gap-1 text-[16px] font-bold">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className="min-h-12 rounded-2xl border border-ink-2 px-4 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-[16px] font-bold">
          Who they are to you
          <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="sister, friend…" className="min-h-12 rounded-2xl border border-ink-2 px-4 font-normal" />
        </label>
        <Button type="submit">Add</Button>
      </form>
    </Card>
  );
}

function ColoursPanel({ s, update }: { s: Settings; update: Update }) {
  return (
    <RadioCard<ColourMode>
      legend="Colours"
      name="colours"
      value={s.colour_mode}
      onChange={(v) => update({ colour_mode: v })}
      options={[
        { value: "standard", label: "Standard", swatch: ["#0E5E52", "#9A3A00", "#B3261E"] },
        { value: "colour_blind", label: "Colour-blind friendly", swatch: ["#0E5E52", "#7A3000", "#1B4F9C"] },
        { value: "high_contrast", label: "High contrast", swatch: ["#07463D", "#6B2700", "#000000"] },
      ]}
    />
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const [tab, setTab] = useState<TabId>("reading");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!n) return;
    const next = TABS[(i + n + TABS.length) % TABS.length].id;
    setTab(next);
    refs.current[next]?.focus();
  };

  const s = settings.data;
  const patch: Update = (p) => update.mutate(p);

  return (
    <SubScreen title="Make Pact work for you">
      <div role="tablist" aria-label="Settings" className="grid grid-cols-4 gap-1 rounded-card bg-divider p-1.5">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-[15px]",
              "ix ix-press-sm",
              tab === t.id ? "bg-surface font-bold text-primary" : "text-ink-2 hover:bg-surface/60 hover:text-ink",
            )}
          >
            <span aria-hidden className="text-[22px] leading-none">
              {t.emoji}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      <div key={tab} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="enter flex flex-col gap-4">
        {!s ? (
          <Skeleton blocks={2} />
        ) : tab === "reading" ? (
          <ReadingPanel s={s} update={patch} />
        ) : tab === "alerts" ? (
          <AlertsPanel s={s} update={patch} />
        ) : tab === "people" ? (
          <PeoplePanel s={s} update={patch} />
        ) : (
          <ColoursPanel s={s} update={patch} />
        )}
      </div>
    </SubScreen>
  );
}
