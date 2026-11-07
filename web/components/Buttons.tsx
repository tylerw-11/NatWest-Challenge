import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger";

const VARIANT: Record<Variant, string> = {
  // 56 px, radius 28, primary fill, 17 px bold white
  primary: "h-14 rounded-[28px] bg-primary text-on-primary hover:bg-primary-hover ix-raise",
  // 52 px, outlined
  secondary: "h-[52px] rounded-[26px] border-2 border-ink bg-surface text-ink hover:bg-tint-teal",
  // Alert actions: "I'm not okay", "Delete my account"
  danger: "h-14 rounded-[28px] border-2 border-due bg-surface text-due hover:bg-due/10",
};

type Common = { variant?: Variant; className?: string; children: React.ReactNode };
type AsButton = Common & React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AsLink = Common & { href: string };

/** Full-width action button. Pass `href` to render a link that looks the same. */
export function Button({ variant = "primary", className, children, ...rest }: AsButton | AsLink) {
  const cls = cn(
    "ix ix-press flex w-full items-center justify-center gap-2 px-6 text-[17px] font-bold disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    className,
  );
  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link href={rest.href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}

/** Small 44 px pill control, e.g. "‹ Week", "Payday", the language pill. */
export function Pill({
  className,
  pressed,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "ix ix-press-sm inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-border bg-bg px-5 text-[16px] font-bold text-ink hover:border-ink-2",
        pressed && "border-primary bg-tint-teal hover:border-primary",
        className,
      )}
      {...rest}
    />
  );
}

/** Round 44 px icon button with a visible label for screen readers. */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "ix ix-press-sm inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink hover:border-ink-2 hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Status chip, e.g. "🍔 £12 left this week". Emoji carry feeling only. */
export function Chip({ emoji, children }: { emoji?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-[16px] text-ink">
      {emoji && <span aria-hidden>{emoji}</span>}
      {children}
    </span>
  );
}

/** Underlined text link, e.g. "Continue as Amara (demo)", "Skip for now". */
export function TextLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "ix inline-flex min-h-11 items-center font-bold text-primary underline decoration-1 underline-offset-2 hover:text-primary-hover hover:decoration-2",
        className,
      )}
    >
      {children}
    </Link>
  );
}
