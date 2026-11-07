"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TabScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Cards";
import { Button } from "@/components/Buttons";
import { ShieldTickIcon } from "@/components/illustrations";
import { LockIcon, MicIcon, PlayIcon } from "@/components/icons";
import { usePactNote, usePactRules, useParsePact, useSavePact } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { speak } from "@/lib/read-aloud";
import type { PactRule } from "@/lib/contracts";

const STARTER =
  "When things get tight, keep takeaways to £20 a week, stop me borrowing for 2 days, tell Jade, and save £15 on payday.";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
};

function getRecognition(): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, new () => SpeechRec>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function duration(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function PactPage() {
  const router = useRouter();
  const saved = usePactRules();
  const note = usePactNote();
  const parse = useParsePact();
  const save = useSavePact();

  const [text, setText] = useState(STARTER);
  const [drafts, setDrafts] = useState<PactRule[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [listening, setListening] = useState(false);
  const firstRun = useRef(true);

  // Parse the words into draft rules: at once on arrival, then 900 ms after typing stops.
  const { mutate } = parse;
  useEffect(() => {
    const t = setTimeout(
      () => {
        if (!text.trim()) return;
        mutate(text, {
          onSuccess: (rules) => {
            setDrafts(rules);
            setChecked(Object.fromEntries(rules.map((r) => [r.id, true])));
          },
        });
      },
      firstRun.current ? 0 : 900,
    );
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [text, mutate]);

  const chosen = drafts.filter((r) => checked[r.id]);
  const pactOn = (saved.data?.length ?? 0) > 0;

  const listen = () => {
    const rec = getRecognition();
    if (!rec) {
      toast("Speaking isn't available in this browser. You can type instead.");
      return;
    }
    rec.lang = "en-GB";
    rec.interimResults = false;
    rec.onresult = (e) => setText(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const agree = () =>
    save.mutate(
      { rules: chosen, note: note.data ?? null },
      {
        onSuccess: () => {
          toast.success(`Pact agreed. ${chosen.length} rules are on.`);
          router.push("/");
        },
        onError: () => toast.error("We could not save your pact. Please try again."),
      },
    );

  return (
    <TabScreen title="Pact">
      <HeroCard
        tone="teal"
        eyebrow="Your promise"
        headline="Make a pact with future you"
        body="Set it calm. It kicks in when a storm comes."
        icon={<ShieldTickIcon />}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="pact-words" className="text-[16px] font-bold">
          In your words
        </label>
        <div className="flex items-start gap-3">
          <textarea
            id="pact-words"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-28 flex-1 resize-none rounded-2xl border border-ink-2 bg-surface px-4 py-3 text-[17px] leading-relaxed"
          />
          <button
            type="button"
            onClick={listen}
            aria-label={listening ? "Listening" : "Say it out loud"}
            aria-pressed={listening}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"
          >
            <MicIcon size={24} aria-hidden />
          </button>
        </div>
      </div>

      <Card className="flex flex-col">
        <h2 className="border-b border-divider pb-3 text-[18px] font-bold">
          Your {drafts.length || ""} rules
        </h2>
        <p aria-live="polite" className="sr-only">
          {parse.isPending ? "Making your rules" : `${drafts.length} rules ready`}
        </p>
        {parse.isError ? (
          <p role="alert" className="py-4 text-[16px]">
            {parse.error instanceof ApiError
              ? parse.error.message_plain
              : "We couldn't turn that into rules. Try saying it another way."}
          </p>
        ) : drafts.length === 0 ? (
          <p className="py-4 text-[16px] text-ink-2">Making your rules…</p>
        ) : (
          <ul className={parse.isPending ? "opacity-60" : undefined}>
            {drafts.map((r) => (
              <li key={r.id} className="border-b border-divider last:border-b-0">
                <label className="flex min-h-16 cursor-pointer items-center gap-4 py-3">
                  <input
                    type="checkbox"
                    checked={!!checked[r.id]}
                    onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))}
                    className="size-7 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block text-[14px] text-ink-2">{r.when_label}</span>
                    <span className="block text-[17px]">{r.then_label}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {note.data && (
        <Card className="flex items-center gap-4 py-4">
          <button
            type="button"
            onClick={() => speak(note.data!.text)}
            aria-label="Play your note to future you"
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"
          >
            <PlayIcon size={22} fill="currentColor" aria-hidden />
          </button>
          <span>
            <span className="block text-[17px] font-bold">
              <span aria-hidden>💌</span> A note to future you
            </span>
            <span className="block text-[15px] text-ink-2">
              {duration(note.data.duration_s)} · plays when a storm starts
            </span>
          </span>
        </Card>
      )}

      <Button onClick={agree} disabled={chosen.length === 0 || save.isPending || parse.isPending}>
        {save.isPending ? "Saving…" : `Agree to ${chosen.length} ${chosen.length === 1 ? "rule" : "rules"}`}
      </Button>

      <p className="flex items-center justify-center gap-2 text-center text-[15px] text-ink-2">
        <LockIcon size={18} aria-hidden />
        {pactOn ? "Your pact is on. " : ""}Changes take 48 hours, so a hard day can&apos;t undo it.
      </p>
    </TabScreen>
  );
}
