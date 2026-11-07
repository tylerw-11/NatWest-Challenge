"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SubScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Button } from "@/components/Buttons";
import { ApiError, api } from "@/lib/api";

const RESEND_AFTER_S = 30;
const input =
  "min-h-12 w-full rounded-2xl border border-ink-2 bg-surface px-4 text-[18px] text-ink focus-visible:outline-3 focus-visible:outline-primary";

const plain = (e: unknown) =>
  e instanceof ApiError ? e.message_plain : "We could not do that right now. Please try again.";

export default function CodeLoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.requestCode(email.trim());
      setDevCode(r.dev_code ?? null);
      setStep("code");
      setCode("");
      setWait(RESEND_AFTER_S);
    } catch (e) {
      setError(plain(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.verifyCode(email.trim(), code);
      // A new session: drop anything cached for the previous user.
      qc.clear();
      router.push(r.new_user ? "/signup/2" : "/");
    } catch (e) {
      setError(plain(e));
      setBusy(false);
    }
  };

  return (
    <SubScreen title="Get a code" backHref="/login">
      <HeroCard
        tone="teal"
        eyebrow="Log in"
        headline={step === "email" ? "We'll send you a code" : "Check your email"}
        body={step === "email" ? "No password needed." : `We sent a 6-digit code to ${email.trim()}.`}
        icon={<span aria-hidden className="text-[56px] leading-none">✉️</span>}
      />

      {step === "email" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="flex flex-col gap-2 text-[17px] font-bold">
            Your email
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </label>
          {error && (
            <p role="alert" className="text-[16px] font-bold text-due">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send my code"}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <label className="flex flex-col gap-2 text-[17px] font-bold">
            Your 6-digit code
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${input} tracking-[0.4em] tabular-nums`}
            />
          </label>
          {devCode && (
            <p className="rounded-card bg-tint-teal px-4 py-3 text-[15px]">
              Test mode: your code is <b className="tabular-nums">{devCode}</b>
            </p>
          )}
          {error && (
            <p role="alert" className="text-[16px] font-bold text-due">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Log in"}
          </Button>
          <Button variant="secondary" onClick={() => void send()} disabled={busy || wait > 0}>
            {wait > 0 ? `Send a new code in ${wait} s` : "Send a new code"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </form>
      )}
    </SubScreen>
  );
}
