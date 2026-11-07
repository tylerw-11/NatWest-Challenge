"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HeroCard } from "@/components/HeroCard";
import { Button } from "@/components/Buttons";
import { RowCard } from "@/components/Cards";
import { ReadAloudButton } from "@/components/Header";
import { ShieldSunIcon } from "@/components/illustrations";
import { ChevronIcon, FaceIdIcon, LockIcon } from "@/components/icons";
import { ApiError, api, USE_MOCKS } from "@/lib/api";
import { LanguagePicker } from "@/components/LanguagePicker";
import { LANGUAGE_EVENT, LANGUAGE_KEY, rememberLanguage } from "@/components/PageLanguage";
import { findLanguage } from "@/lib/languages";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Language before logging in: remembered in this browser, then saved to settings after sign-up.
  const [chooseLanguage, setChooseLanguage] = useState(false);
  const [language, setLanguage] = useState<string | null>(null);
  useEffect(() => {
    try {
      setLanguage(window.localStorage.getItem(LANGUAGE_KEY));
    } catch {
      /* storage blocked */
    }
    const on = (e: Event) => setLanguage((e as CustomEvent<string | null>).detail);
    window.addEventListener(LANGUAGE_EVENT, on);
    return () => window.removeEventListener(LANGUAGE_EVENT, on);
  }, []);

  const demoLogin = async () => {
    setBusy(true);
    await api.authDemo();
    router.push("/");
  };

  /** Real passkey login (Face ID, Touch ID, Windows Hello). In mock mode it stays the demo login. */
  const faceIdLogin = async () => {
    if (USE_MOCKS) return demoLogin();
    setBusy(true);
    try {
      await api.passkeyLogin();
      router.push("/");
    } catch (e) {
      const cancelled = e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");
      const unknown = e instanceof ApiError && (e.code === "passkey_unknown" || e.code === "passkey_failed");
      const unsupported = typeof window !== "undefined" && !window.PublicKeyCredential;
      toast(
        cancelled || unknown || unsupported
          ? "No Face ID set up on this device yet. Get a code first, then turn on Face ID in Account."
          : e instanceof ApiError
            ? e.message_plain
            : "We could not log you in with Face ID. Please try a code instead.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 pt-5">
        <button
          type="button"
          aria-expanded={chooseLanguage}
          aria-controls="login-language"
          onClick={() => setChooseLanguage((v) => !v)}
          className="ix ix-press-sm inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-[17px] font-bold hover:border-ink-2 hover:bg-surface-hover"
        >
          <span aria-hidden>🌍</span> <span data-no-translate>{findLanguage(language)?.native ?? "English"}</span>
        </button>
        <ReadAloudButton />
      </header>
      {chooseLanguage && (
        <div id="login-language" className="mx-5 mt-3 rounded-card border border-border bg-surface p-4">
          <LanguagePicker
            id="login-translation"
            label="Language"
            value={language}
            onChange={(code) => {
              rememberLanguage(code);
              setChooseLanguage(false);
            }}
          />
        </div>
      )}

      <main className="enter flex flex-1 flex-col gap-4 px-5 pt-4 pb-6">
        <Image
          src="/brand/pact-logo.png"
          alt="Pact. Your money weather, with a plan."
          width={2400}
          height={880}
          priority
          sizes="350px"
          className="h-auto w-full rounded-card"
        />
        <HeroCard
          tone="teal"
          centred
          eyebrow="Welcome to Pact"
          headline="Your money weather, with a plan for the storms"
          body="Free to use. No passwords to remember."
          icon={<ShieldSunIcon />}
        />

        <Button onClick={faceIdLogin} disabled={busy}>
          <FaceIdIcon size={24} aria-hidden /> Log in with Face ID
        </Button>
        <Button variant="secondary" href="/login/code">
          Get a code by text or email
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={demoLogin}
            disabled={busy}
            className="ix inline-flex min-h-11 items-center font-bold text-primary underline decoration-1 underline-offset-2 hover:text-primary-hover hover:decoration-2"
          >
            Continue as Amara (demo)
          </button>
        </div>

        <Link href="/signup/2">
          <RowCard
            icon={<span aria-hidden className="text-[28px]">👋</span>}
            title="New to Pact?"
            subtitle="Set up in 3 short steps"
            trailing={<ChevronIcon size={24} aria-hidden />}
          />
        </Link>
        <Link href="/support">
          <RowCard
            icon={<span aria-hidden className="text-[28px]">💬</span>}
            title="Trouble logging in?"
            subtitle="Message us, no phone call needed"
            trailing={<ChevronIcon size={24} aria-hidden />}
          />
        </Link>

        <p className="mt-auto flex items-center justify-center gap-2 pt-6 text-[16px] text-ink-2">
          <LockIcon size={18} aria-hidden /> We never see your bank password.
        </p>
      </main>
    </div>
  );
}
