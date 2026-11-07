"use client";

import { useState } from "react";
import type { Day } from "@/lib/contracts";
import { stateLabel, weekdayTwo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DayStateIcon } from "./illustrations";
import { BackIcon, ChevronIcon } from "./icons";
import { IconButton } from "./Buttons";

const CELL: Record<Day["state"], string> = {
  clear: "bg-surface border-clear-hero",
  cloudy: "bg-tight-hero border-tight-hero",
  storm: "bg-storm-hero border-storm-hero",
};

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "This week" strip: 7 day cards with week arrows, paging through the forecast. */
export function WeekStrip({ days }: { days: Day[] }) {
  const weeks = Math.ceil(days.length / 7);
  const [week, setWeek] = useState(0);
  const shown = days.slice(week * 7, week * 7 + 7);
  const title =
    week === 0 ? "This week" : week === 1 ? "Next week" : `Week of ${longDate(shown[0].date).replace(/^\w+ /, "")}`;

  return (
    <section aria-labelledby="week-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="week-title" className="text-[18px] font-bold" aria-live="polite">
          {title}
        </h2>
        <div className="flex gap-2">
          <IconButton label="Previous week" disabled={week === 0} onClick={() => setWeek((w) => w - 1)} className="disabled:opacity-40">
            <BackIcon size={22} />
          </IconButton>
          <IconButton label="Next week" disabled={week >= weeks - 1} onClick={() => setWeek((w) => w + 1)} className="disabled:opacity-40">
            <ChevronIcon size={22} />
          </IconButton>
        </div>
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {shown.map((d) => (
          <li
            key={d.date}
            className={cn("flex flex-col items-center gap-1.5 rounded-2xl border-2 py-2.5", CELL[d.state])}
          >
            <span className="sr-only">
              {longDate(d.date)}, {stateLabel(d.state)}
            </span>
            <span aria-hidden className="text-[13px] font-bold text-ink-2">
              {weekdayTwo(d.date)}
            </span>
            <DayStateIcon state={d.state} size={22} />
            <span aria-hidden className="text-[15px] font-bold">
              {Number(d.date.slice(8))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
