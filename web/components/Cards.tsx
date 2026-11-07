import { cn } from "@/lib/utils";

/** Plain white card: radius 20, border. */
export function Card({
  className,
  children,
  as: Tag = "section",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("rounded-card border border-border bg-surface p-5", className)}>
      {children}
    </Tag>
  );
}

export type ListRow = {
  id: string;
  label: React.ReactNode;
  value: React.ReactNode;
  /** Paint the value in the due colour (due dates). Always paired with a date. */
  due?: boolean;
};

/**
 * List card: 18 px heading, one-line rows ≥ 40 px, label left (regular),
 * value right (bold). Extra detail sits behind a <details>.
 */
export function ListCard({
  heading,
  rows,
  detailsLabel = "See where these come from",
  details,
}: {
  heading: string;
  rows: ListRow[];
  detailsLabel?: string;
  details?: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="text-[18px] font-bold">{heading}</h2>
      <ul className="mt-2">
        {rows.map((r) => (
          <li key={r.id} className="flex min-h-10 items-center justify-between gap-3 py-2 text-[16px]">
            <span>{r.label}</span>
            <span className={cn("shrink-0 font-bold", r.due && "text-due")}>{r.value}</span>
          </li>
        ))}
      </ul>
      {details && (
        <details className="group mt-2 border-t border-divider pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center font-bold text-primary [&::-webkit-details-marker]:hidden">
            {detailsLabel}
          </summary>
          <div className="pt-1 pb-1 text-[15px] text-ink-2">{details}</div>
        </details>
      )}
    </Card>
  );
}

/** Tip card: tint-teal, radius 20, 💡 then one sentence with the key outcome in bold. */
export function TipCard({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex gap-4 rounded-card bg-tint-teal px-5 py-5 text-[16px] leading-relaxed">
      <span aria-hidden className="text-[22px] leading-none">💡</span>
      <p>{children}</p>
    </aside>
  );
}

/** Tile: small label, big bold value (e.g. "Safety buffer / 6 days"). */
export function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card as="div" className="flex flex-1 flex-col gap-1 px-4 py-4">
      <span className="text-[15px] text-ink-2">{label}</span>
      <span className="text-[30px] leading-tight font-bold">{value}</span>
    </Card>
  );
}

/** Tappable row card with icon, title, subtitle and chevron (Support, Log in). */
export function RowCard({
  icon,
  title,
  subtitle,
  trailing,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-16 items-center gap-4 rounded-card border border-border bg-surface px-5 py-4">
      {icon && <span className="shrink-0 text-primary">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold">{title}</span>
        {subtitle && <span className="block text-[15px] text-ink-2">{subtitle}</span>}
      </span>
      {trailing}
    </div>
  );
}
