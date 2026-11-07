"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LANGUAGES, findLanguage } from "@/lib/languages";
import { cn } from "@/lib/utils";

type Option = { code: string | null; native: string; name: string; dir: "ltr" | "rtl" };

const OFF: Option = { code: null, native: "Off", name: "English only", dir: "ltr" };
const OPTIONS: Option[] = [OFF, ...LANGUAGES];

/** Case- and accent-insensitive text for matching. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const display = (o: Option) => (o.code ? `${o.native} (${o.name})` : "Off (English only)");

/**
 * Translation language picker: a WAI-ARIA combobox. Type to filter (English name, native
 * name or code), scroll the list, arrow keys to move, Enter to pick, Escape to close.
 */
export function LanguagePicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (code: string | null) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = findLanguage(value) ?? OFF;
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return OPTIONS;
    return OPTIONS.filter((o) => [o.name, o.native, o.code ?? "off english"].some((s) => fold(s).includes(q)));
  }, [query]);

  // Keep the highlighted option in view while arrowing through the scrollable list.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    setOpen(true);
    setQuery("");
    setActive(Math.max(0, OPTIONS.findIndex((o) => o.code === selected.code)));
  };

  const choose = (o: Option) => {
    onChange(o.code);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.min(results.length - 1, Math.max(0, i + step)));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div className="relative w-full">
      <label htmlFor={id} className="mb-2 block text-[18px]">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={open ? query : display(selected)}
          placeholder={open ? "Type a language" : undefined}
          onFocus={openList}
          onClick={() => !open && openList()}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            setQuery("");
          }}
          className="min-h-12 w-full min-w-0 flex-1 rounded-2xl border border-ink-2 bg-surface px-4 text-[17px]"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close the language list" : "Show all languages"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) setOpen(false);
            else {
              inputRef.current?.focus();
              openList();
            }
          }}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-ink-2 bg-surface text-[18px]"
        >
          <span aria-hidden>{open ? "▴" : "▾"}</span>
        </button>
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={`${label}: ${LANGUAGES.length} languages`}
        hidden={!open}
        className="absolute right-0 left-0 z-20 mt-2 max-h-[300px] overflow-y-auto overscroll-contain rounded-2xl border border-ink-2 bg-surface py-1 shadow-lg"
      >
        {results.length === 0 ? (
          <li className="px-4 py-3 text-[16px] text-ink-2">No language matches &ldquo;{query}&rdquo;.</li>
        ) : (
          results.map((o, i) => (
            <li
              key={o.code ?? "off"}
              id={optionId(i)}
              data-index={i}
              role="option"
              aria-selected={o.code === selected.code}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseMove={() => setActive(i)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-[17px]",
                i === active && "bg-tint-teal",
                o.code === selected.code && "font-bold",
              )}
            >
              <span lang={o.code ?? "en"} dir={o.dir} className="min-w-0 truncate">
                {o.native}
              </span>
              <span className="shrink-0 text-[15px] text-ink-2">{o.name}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
