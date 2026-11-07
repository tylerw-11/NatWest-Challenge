"use client";

import { useState } from "react";
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

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
          onClick={() => toast("More languages are coming soon.")}
          className="ix ix-press-sm inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-[17px] font-bold hover:border-ink-2 hover:bg-surface-hover"
        >
          <span aria-hidden>🌍</span> English
        </button>
        <ReadAloudButton />
      </header>

      <main className="enter flex flex-1 flex-col gap-4 px-5 pt-4 pb-6">
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
