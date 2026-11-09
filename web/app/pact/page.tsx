"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TabScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Cards";
import { Button } from "@/components/Buttons";
import { ShieldTickIcon } from "@/components/illustrations";
import { LockIcon, MicIcon } from "@/components/icons";
import { PlayButton } from "@/components/PlayButton";
import { usePactNote, usePactRules, useParsePact, useSavePact, useSavePactNote } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import type { PactRule } from "@/lib/contracts";
import { cn } from "@/lib/utils";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
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
  const saveNote = useSavePactNote();

  const [text, setText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [drafts, setDrafts] = useState<PactRule[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const wordsRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (note.data) setNoteText(note.data.text);
  }, [note.data]);

  const chosen = drafts.filter((r) => checked[r.id]);
  const pactOn = (saved.data?.length ?? 0) > 0;

  const generateSuggestions = () => {
    const request = text.trim();
    if (!request) {
      toast("Add a few words about what you want your pact to do first.");
      wordsRef.current?.focus();
      return;
    }
    setDrafts([]);
    setChecked({});
    parse.mutate(request, {
      onSuccess: (rules) => {
        setDrafts(rules);
        setChecked(Object.fromEntries(rules.map((r) => [r.id, true])));
      },
    });
  };

  const listen = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    recRef.current = rec;
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
      { rules: chosen, note: null },
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
        headline="Choose how to prepare for a money storm"
        body="Pact brings back the reminders you choose when your forecast shows money may be tight."
        icon={<ShieldTickIcon />}
      />

      <Card className="flex flex-col gap-3">
        <h2 className="text-[18px] font-bold">How Pact works</h2>
        <ol className="flex flex-col gap-2 text-[16px] leading-relaxed">
          <li><b>1.</b> Tell Claude your goal or a rule you want to follow.</li>
          <li><b>2.</b> Review the suggestions and select the ones you want.</li>
          <li><b>3.</b> Agree to save them. Pact shows your chosen reminders when a storm appears in your forecast.</li>
        </ol>
        <p className="border-t border-divider pt-3 text-[14px] text-ink-2">
          Claude drafts suggestions from your words. Pact removes names it knows, email addresses, and long numbers first. Pact does not connect to your bank or move money.
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <label htmlFor="pact-words" className="text-[16px] font-bold">
          Your goal or rule
        </label>
        <p className="text-[14px] text-ink-2">For a savings goal, Claude suggests 3–5 ideas. For a specific rule, it drafts that rule.</p>
        <div className="flex items-start gap-3">
          <textarea
            ref={wordsRef}
            id="pact-words"
            rows={4}
            value={text}
            placeholder="Tell Pact what you want future you to do when money may be tight."
            disabled={parse.isPending}
            onChange={(e) => {
              setText(e.target.value);
              setDrafts([]);
              setChecked({});
            }}
            className="ix min-h-28 flex-1 resize-none rounded-2xl border border-ink-2 bg-surface px-4 py-3 text-[17px] leading-relaxed hover:border-ink"
          />
          <button
            type="button"
            onClick={listen}
            aria-label={listening ? "Listening. Tap to stop" : "Say it out loud"}
            aria-pressed={listening}
            className={cn(
              "ix ix-press-sm inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary-hover",
              listening && "animate-live ring-2 ring-primary ring-offset-2 ring-offset-bg",
            )}
          >
            <MicIcon size={24} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={generateSuggestions} disabled={parse.isPending}>
          {parse.isPending ? "Thinking of ideas…" : "Get suggestions from Claude"}
        </Button>
        <p className="px-1 text-[14px] text-ink-2">
          Nothing is saved to your Pact until you agree.
        </p>
      </div>

      <Card className="flex flex-col">
        <h2 className="border-b border-divider pb-3 text-[18px] font-bold">
          {drafts.length > 0 && drafts.every((rule) => rule.action.kind === "show_note")
            ? `Claude’s suggestions (${drafts.length})`
            : `Your ${drafts.length || ""} rules`}
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
          <p className="py-4 text-[16px] text-ink-2">Your draft rules will appear here for you to review.</p>
        ) : (
          <ul className={parse.isPending ? "opacity-60" : undefined}>
            {drafts.map((r) => (
              <li key={r.id} className="border-b border-divider last:border-b-0">
                <label className="ix -mx-2 flex min-h-16 cursor-pointer items-center gap-4 rounded-xl px-2 py-3 hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={!!checked[r.id]}
                    onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))}
                    className="size-7 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block text-[14px] text-ink-2">{r.when_label}</span>
                    <span className="block text-[17px]">{r.then_label}</span>
                    {r.action.kind === "show_note" && typeof r.action.reminder === "string" && (
                      <span className="mt-1 block text-[15px] text-ink-2">
                        Claude suggests: {r.action.reminder}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="text-[18px] font-bold"><span aria-hidden>💌</span> A message for later</h2>
          <p className="mt-1 text-[14px] text-ink-2">This note appears in Storm mode and is never sent to Claude.</p>
        </div>
        <label htmlFor="pact-note" className="text-[16px] font-bold">Your note</label>
        <textarea
          id="pact-note"
          rows={3}
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          placeholder="What would you like future you to remember?"
          maxLength={4000}
          disabled={saveNote.isPending}
          className="ix min-h-24 resize-y rounded-2xl border border-ink-2 bg-surface px-4 py-3 text-[17px] leading-relaxed hover:border-ink"
        />
        <Button
          variant="secondary"
          onClick={() => saveNote.mutate(
            { text: noteText.trim(), duration_s: note.data?.duration_s ?? 0 },
            {
              onSuccess: () => toast.success("Your message is saved for later."),
              onError: () => toast.error("We could not save your message. Please try again."),
            },
          )}
          disabled={saveNote.isPending}
        >
          {saveNote.isPending ? "Saving message…" : "Save message for later"}
        </Button>
        {note.data?.text && (
          <div className="flex items-center gap-3 border-t border-divider pt-3 text-[14px] text-ink-2">
            <PlayButton id="note-pact" text={note.data.text} label="Play your saved note" />
            <span>Saved for a storm · {duration(note.data.duration_s)}</span>
          </div>
        )}
      </Card>

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
