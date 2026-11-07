import { cn } from "@/lib/utils";

export type HeroTone = "clear" | "tight" | "storm" | "rewind" | "teal";

const TONE: Record<HeroTone, { bg: string; label: string }> = {
  clear: { bg: "bg-clear-hero", label: "text-clear-label" },
  tight: { bg: "bg-tight-hero", label: "text-tight-label" },
  storm: { bg: "bg-storm-hero", label: "text-storm-label" },
  rewind: { bg: "bg-rewind-hero", label: "text-rewind-label" },
  teal: { bg: "bg-tint-teal", label: "text-primary" },
};

/**
 * Hero card: tinted, radius 24, padding 22×20. 72 px icon on the left
 * (or centred 96 px on Log in), uppercase 13 px eyebrow, 26 px headline,
 * one 16 px line.
 */
export function HeroCard({
  tone,
  eyebrow,
  headline,
  body,
  icon,
  centred = false,
  children,
  className,
}: {
  tone: HeroTone;
  eyebrow: string;
  headline: React.ReactNode;
  body?: React.ReactNode;
  icon?: React.ReactNode;
  centred?: boolean;
  /** Extra content under the text, e.g. the mood buttons on Support. */
  children?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  const text = (
    <div className={cn("min-w-0", centred && "text-center")}>
      <p className={cn("text-[13px] font-bold tracking-wide uppercase", t.label)}>{eyebrow}</p>
      <h2 className="mt-1 text-[26px] leading-[1.2] font-bold text-ink">{headline}</h2>
      {body && <p className="mt-2 text-[16px] leading-snug text-ink-2">{body}</p>}
    </div>
  );
  return (
    <section className={cn("rounded-hero px-5 py-[22px]", t.bg, className)}>
      {centred ? (
        <div className="flex flex-col items-center gap-3">
          {icon}
          {text}
        </div>
      ) : icon ? (
        <div className="flex items-center gap-4">
          <div className="flex w-[72px] shrink-0 justify-center">{icon}</div>
          {text}
        </div>
      ) : (
        text
      )}
      {children}
    </section>
  );
}
