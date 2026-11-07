"use client";

import { useState } from "react";
import type { ColourMode } from "@/lib/contracts";
import { applyColourMode } from "@/lib/colour-mode";
import { useForecast, useRewind, useSettings } from "@/lib/hooks";
import { USE_MOCKS } from "@/lib/api";
import { gbp, oneInN, stateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS: { title: string; tokens: string[] }[] = [
  { title: "Base", tokens: ["bg", "surface", "border", "divider", "ink", "ink-2"] },
  { title: "Brand", tokens: ["primary", "on-primary", "tint-teal"] },
  { title: "Clear (fine)", tokens: ["clear-hero", "clear-label", "sun", "sun-ring"] },
  { title: "Tight", tokens: ["tight-hero", "tight-label"] },
  { title: "Storm", tokens: ["storm-hero", "storm-label", "storm-bg"] },
  { title: "Rewind", tokens: ["rewind-hero", "rewind-label"] },
  { title: "Alerts and charts", tokens: ["due", "chart-base"] },
];

const MODES: { id: ColourMode; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "colour_blind", label: "Colour-blind" },
  { id: "high_contrast", label: "High contrast" },
];

export default function TokensPage() {
  const [mode, setMode] = useState<ColourMode>("standard");
  const forecast = useForecast();
  const rewind = useRewind();
  const settings = useSettings();

  const storm = forecast.data?.days.find((d) => d.state === "storm");

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <h1 className="text-[22px] font-bold">Design tokens</h1>

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
              mode === m.id
                ? "border-primary bg-primary font-bold text-on-primary"
                : "border-border bg-surface",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {GROUPS.map((g) => (
        <section
          key={g.title}
          className="rounded-card border border-border bg-surface p-5"
        >
          <h2 className="text-[18px] font-bold">{g.title}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {g.tokens.map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="size-10 shrink-0 rounded-xl border border-divider"
                  style={{ background: `var(--${t})` }}
                />
                <code className="text-xs text-ink-2">--{t}</code>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-[18px] font-bold">Type and radii</h2>
        <p className="mt-2 text-[26px] font-bold leading-tight">Headline 26 bold</p>
        <p className="text-[16px]">Body 16 regular, Atkinson Hyperlegible</p>
        <div className="mt-3 flex gap-3">
          <div className="h-14 flex-1 rounded-hero bg-tint-teal p-2 text-xs">hero 24</div>
          <div className="h-14 flex-1 rounded-card bg-tint-teal p-2 text-xs">card 20</div>
          <div className="h-14 flex-1 rounded-full bg-tint-teal p-2 text-center text-xs leading-10">pill</div>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-[18px] font-bold">Data check ({USE_MOCKS ? "mocks" : "engine"})</h2>
        {forecast.isError || rewind.isError || settings.isError ? (
          <p className="mt-2 text-due">Data failed to load or did not match the contract.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-[15px]">
            <li>Days in forecast: <b>{forecast.data?.days.length ?? "…"}</b></li>
            <li>Covered until: <b>{forecast.data?.covered_until ?? "…"}</b></li>
            <li>
              Storm day: <b>{storm?.date ?? "…"}</b>,{" "}
              <b>{storm ? `${oneInN(storm.p_shortfall)} (${stateLabel(storm.state)})` : "…"}</b>,
              most likely <b>{storm ? gbp(storm.p50) : "…"}</b> left
            </li>
            <li>
              Best action: <b>{forecast.data ? `${gbp(forecast.data.best_action.amount_gbp)} → ${oneInN(forecast.data.best_action.p_after)}` : "…"}</b>
            </li>
            <li>Rewind total: <b>{rewind.data ? gbp(rewind.data.total_gbp) : "…"}</b></li>
            <li>Reading level: <b>{settings.data?.reading_level ?? "…"}</b></li>
          </ul>
        )}
      </section>
    </main>
  );
}
