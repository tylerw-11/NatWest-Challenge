"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PactNavIcon, RewindNavIcon, SupportNavIcon, WeatherNavIcon } from "./icons";

const TABS = [
  { href: "/", label: "Weather", Icon: WeatherNavIcon },
  { href: "/pact", label: "Pact", Icon: PactNavIcon },
  { href: "/rewind", label: "Rewind", Icon: RewindNavIcon },
  { href: "/support", label: "Support", Icon: SupportNavIcon },
] as const;

/** 76 px bottom nav; the active item is primary and bold. */
export function BottomNav({
  active,
  sticky = true,
}: {
  /** Override the active tab (used on /dev/components). */
  active?: (typeof TABS)[number]["href"];
  sticky?: boolean;
}) {
  const pathname = usePathname();
  const current = active ?? pathname;
  return (
    <nav
      aria-label="Main"
      className={cn(
        "h-[76px] border-t border-divider bg-surface",
        sticky && "sticky bottom-0 z-10",
      )}
    >
      <ul className="grid h-full grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const isActive = current === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[15px]",
                  isActive ? "font-bold text-primary" : "text-ink-2",
                )}
              >
                <Icon size={24} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
