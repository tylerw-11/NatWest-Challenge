"use client";

import { useState } from "react";
import type { ColourMode } from "@/lib/contracts";
import { applyColourMode } from "@/lib/colour-mode";
import { cn } from "@/lib/utils";
import { TabHeader, SubHeader } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { HeroCard } from "@/components/HeroCard";
import { ListCard, RowCard, TipCard, Tile } from "@/components/Cards";
import { Button, Chip, Pill, TextLink } from "@/components/Buttons";
import {
  RewindClockIcon,
  ShieldSunIcon,
  ShieldTickIcon,
  StormCloudIcon,
  SunIcon,
  SunSmallIcon,
} from "@/components/illustrations";
import { ChevronIcon, FaceIdIcon, LockIcon, SlidersIcon } from "@/components/icons";

/*
 * Component gallery for Feature 2. Text and figures here are SAMPLE copy
 * from the design PNGs; real screens take every figure from engine/mock data.
 */

const MODES: { id: ColourMode; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "colour_blind", label: "Colour-blind" },
  { id: "high_contrast", label: "High contrast" },
];

function Section({ title, png, children }: { title: string; png: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between border-b border-divider pb-1">
        <h2 className="text-[15px] font-bold">{title}</h2>
        <span className="text-xs text-ink-2">{png}</span>
      </div>
      {children}
    </section>
  );
}

export default function ComponentsPage() {
  const [mode, setMode] = useState<ColourMode>("standard");
  const [pill, setPill] = useState("Payday");

  return (
    <main className="flex flex-col gap-8 px-5 py-6">
      <h1 className="text-[22px] font-bold">Components</h1>

      <div role="group" aria-label="Colour mode" className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => {
              setMode(m.id);
              applyColourMode(m.id);
            }}
            className={cn(
              "min-h-11 flex-1 rounded-full border px-3 text-sm",
              mode === m.id ? "border-primary bg-primary font-bold text-on-primary" : "border-border bg-surface",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Section title="TabHeader (title, emoji, read-aloud, settings)" png="1 Weather">
        <div className="-mx-5 border-y border-divider">
          <TabHeader title="Hi Amara" emoji="👋" showSettings />
        </div>
        <div className="-mx-5 border-y border-divider">
          <TabHeader title="Support" emoji="💛" />
        </div>
      </Section>

      <Section title="SubHeader" png="2 Time River">
        <div className="-mx-5 border-y border-divider">
          <SubHeader title="Mon 23 March" backHref="/dev/components" />
        </div>
      </Section>

      <Section title="BottomNav (Weather active)" png="1 Weather">
        <div className="-mx-5">
          <BottomNav active="/" sticky={false} />
        </div>
      </Section>

      <Section title="Drawn icons" png="1, 2, 3, 5, 8">
        <div className="flex flex-wrap items-center gap-4 rounded-card bg-surface p-4">
          <SunIcon />
          <SunSmallIcon size={28} />
          <StormCloudIcon />
          <StormCloudIcon size={40} rain={false} />
          <ShieldTickIcon />
          <ShieldSunIcon size={72} />
          <RewindClockIcon />
        </div>
      </Section>

      <Section title="HeroCard: clear, storm, rewind, teal, centred" png="1, 2, 5, 3, 8">
        <HeroCard tone="clear" eyebrow="Clear" headline="You're good until Thu 19 March" body="Enjoy a calm week." icon={<SunIcon />} />
        <HeroCard tone="storm" eyebrow="Storm" headline="1 in 3 chance of going short" body="Most likely: £35 left" icon={<StormCloudIcon />} />
        <HeroCard tone="rewind" eyebrow="Last 12 months" headline="£214 extra, just for being short" body={<>Not your fault. It costs more to have less. <span aria-hidden>💛</span></>} icon={<RewindClockIcon />} />
        <HeroCard tone="teal" eyebrow="Your promise" headline="Make a pact with future you" body="Set it calm. It kicks in when a storm comes." icon={<ShieldTickIcon />} />
        <HeroCard tone="teal" centred eyebrow="Welcome to Pact" headline="Your money weather, with a plan for the storms" body="Free to use. No passwords to remember." icon={<ShieldSunIcon />} />
      </Section>

      <Section title="ListCard with due dates and details" png="2 Time River">
        <ListCard
          heading="What causes this"
          rows={[
            { id: "a", label: "Council tax · £118", value: "Due 23 Mar", due: true },
            { id: "b", label: "Phone renewal · £45", value: "Due 22 Mar", due: true },
            { id: "c", label: "Quieter week · −£90", value: "16 to 22 Mar", due: true },
          ]}
          details={<p>Sample source note: paid on the 23rd each month for the last 11 months.</p>}
        />
        <ListCard
          heading="Where it went"
          rows={[
            { id: "a", label: "Paying insurance monthly", value: "£118" },
            { id: "b", label: "Overdraft interest", value: "£61" },
            { id: "c", label: "Pay-later late fees", value: "£35" },
          ]}
          details={<p>Sample source note.</p>}
        />
      </Section>

      <Section title="TipCard" png="2 Time River">
        <TipCard>
          Save £15 on payday (Fri 13). <b>The storm drops to 1 in 8.</b>
        </TipCard>
      </Section>

      <Section title="Tiles" png="1 Weather">
        <div className="flex gap-4">
          <Tile label="Safety buffer" value="6 days" />
          <Tile label="Pact rules on" value="4" />
        </div>
      </Section>

      <Section title="Buttons" png="1, 8, 4">
        <Button>Get ready for it</Button>
        <Button>
          <FaceIdIcon size={24} aria-hidden /> Log in with Face ID
        </Button>
        <Button variant="secondary">Get a code by text or email</Button>
        <Button variant="danger">
          <span aria-hidden>🫂</span> I&apos;m not okay
        </Button>
        <div className="text-center">
          <TextLink href="/dev/components">Continue as Amara (demo)</TextLink>
        </div>
      </Section>

      <Section title="Pills" png="2 Time River">
        <div className="grid grid-cols-3 gap-3">
          {["‹ Week", "Payday", "Week ›"].map((p) => (
            <Pill key={p} pressed={pill === p} onClick={() => setPill(p)}>
              {p}
            </Pill>
          ))}
        </div>
      </Section>

      <Section title="Chips" png="4 Storm mode">
        <div className="flex flex-wrap gap-3">
          <Chip emoji="🍔">£12 left this week</Chip>
          <Chip emoji="⏸️">Borrowing paused</Chip>
          <Chip emoji="🤝">Jade knows</Chip>
        </div>
      </Section>

      <Section title="RowCard" png="6 Support, 8 Log in">
        <RowCard
          icon={<SlidersIcon size={26} aria-hidden />}
          title="Make Pact work for you"
          subtitle="Reading, alerts, people, colours"
          trailing={<ChevronIcon size={24} aria-hidden />}
        />
        <RowCard
          icon={<span aria-hidden className="text-[26px]">👋</span>}
          title="New to Pact?"
          subtitle="Set up in 3 short steps"
          trailing={<ChevronIcon size={24} aria-hidden />}
        />
      </Section>

      <Section title="Lock line" png="3 Pact, 8 Log in">
        <p className="flex items-center justify-center gap-2 text-[16px] text-ink-2">
          <LockIcon size={18} aria-hidden /> Changes take 48 hours, so a hard day can&apos;t undo it.
        </p>
      </Section>
    </main>
  );
}
