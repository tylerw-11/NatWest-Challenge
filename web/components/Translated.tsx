"use client";

import { useSettings } from "@/lib/hooks";
import { findLanguage } from "@/lib/languages";
import { t as translate, type Key } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Vars = Record<string, string | number | null | undefined>;

/** The user's translation language (Settings > Reading), or null for English only. */
export function useTranslation() {
  const settings = useSettings();
  const code = settings.data?.translation ?? null;
  const dir = findLanguage(code)?.dir ?? "ltr";
  return { code, dir, t: (key: Key, vars?: Vars) => translate(code, key, vars) };
}

/**
 * A translated line shown under the English, which always stays on screen.
 * Renders nothing when translation is off. Pass the same engine values the English uses.
 */
export function Translated({
  k,
  vars,
  as = "p",
  className,
}: {
  k: Key;
  vars?: Vars;
  /** "span" inside a <p> or a link. */
  as?: "p" | "span";
  className?: string;
}) {
  const { code, dir, t } = useTranslation();
  if (!code || code === "en") return null;
  const Tag = as;
  return (
    <Tag lang={code} dir={dir} className={cn("block text-[15px] leading-snug font-normal text-ink-2", className)}>
      {t(k, vars)}
    </Tag>
  );
}
