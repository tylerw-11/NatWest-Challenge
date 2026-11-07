import Link from "next/link";
import { Translated } from "@/components/Translated";
import { dayLong } from "@/lib/format";
import { StormCloudIcon } from "./illustrations";
import { ChevronIcon } from "./icons";

/** Peach "STORM AHEAD" card; opens Time River for that day. */
export function StormCard({ date }: { date: string }) {
  return (
    <Link
      href={`/river?day=${date}`}
      className="ix ix-lift ix-press flex items-center gap-4 rounded-card bg-storm-hero px-5 py-4"
    >
      <StormCloudIcon size={52} rain={false} />
      <span className="flex-1">
        <span className="block text-[13px] font-bold tracking-wide text-storm-label uppercase">Storm ahead</span>
        <span className="block text-[18px] font-bold">{dayLong(date)}</span>
        <Translated as="span" k="storm_ahead" vars={{ date }} />
      </span>
      <ChevronIcon size={26} className="ix-nudge text-storm-label" aria-hidden />
    </Link>
  );
}
