"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SubScreen } from "@/components/Screen";
import { Card } from "@/components/Cards";
import { Button } from "@/components/Buttons";
import { FallbackCard, Skeleton } from "@/components/Fallback";
import { DownloadIcon } from "@/components/icons";
import { useMe, usePactRules, useSettings } from "@/lib/hooks";
import { ApiError, api } from "@/lib/api";

const linkBtn = "ix inline-flex min-h-11 items-center font-bold text-primary hover:text-primary-hover hover:underline";

function Row({ children, last = false }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex min-h-14 items-center justify-between gap-3 py-2 ${last ? "" : "border-b border-divider"}`}>
      {children}
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const me = useMe();
  const settings = useSettings();
  const rules = usePactRules();
  const [turningOn, setTurningOn] = useState(false);

  /** Register a passkey for this device (Face ID, Touch ID, Windows Hello). */
  const turnOnFaceId = async () => {
    setTurningOn(true);
    try {
      await api.registerPasskey();
      toast("Face ID is on for this device.");
      await me.refetch();
    } catch (e) {
      const cancelled = e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");
      const unsupported = typeof window !== "undefined" && !window.PublicKeyCredential;
      toast(
        unsupported
          ? "This device can't use Face ID with Pact. You can still log in with a code."
          : cancelled
            ? "Face ID was not turned on. You can try again any time."
            : e instanceof ApiError
              ? e.message_plain
              : "We could not turn on Face ID. Please try again.",
      );
    } finally {
      setTurningOn(false);
    }
  };
  const soon = (what: string) => toast(`In the full app you can ${what} here.`);

  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ me: me.data, settings: settings.data, pact: rules.data }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-pact-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (me.isPending)
    return (
      <SubScreen title="Account">
        <Skeleton />
      </SubScreen>
    );
  if (me.isError)
    return (
      <SubScreen title="Account">
        <FallbackCard error={me.error} onRetry={() => me.refetch()} />
      </SubScreen>
    );

  const { user, bank, phone_masked, devices } = me.data;
  const connectedUntil = bank
    ? new Date(`${bank.connected_until}T12:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  return (
    <SubScreen title="Account">
      <section className="flex items-center gap-4 rounded-hero bg-tint-teal px-5 py-5">
        <span
          aria-hidden
          className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-[26px] font-bold text-on-primary"
        >
          {user.name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[22px] font-bold">{user.name}</span>
          <span className="block truncate text-[16px] text-ink-2">{user.email}</span>
        </span>
        <button
          type="button"
          onClick={() => soon("change your name and email")}
          className="ix ix-press-sm inline-flex min-h-11 items-center rounded-full border-2 border-primary bg-surface px-5 font-bold text-primary hover:bg-tint-teal"
        >
          Edit
        </button>
      </section>

      <Card className="py-3">
        <h2 className="text-[18px] font-bold">Logging in</h2>
        <Row last={!phone_masked}>
          <span className="text-[17px]">Face ID on this device</span>
          {me.data.has_passkey ? (
            <span className="text-[16px] font-bold text-primary">On</span>
          ) : (
            <button type="button" className={linkBtn} onClick={turnOnFaceId} disabled={turningOn}>
              {turningOn ? "Turning on…" : "Turn on"}
            </button>
          )}
        </Row>
        {phone_masked && (
          <Row last>
            <span className="text-[17px]">Text code to {phone_masked}</span>
            <button type="button" className={linkBtn} onClick={() => soon("change your phone number")}>
              Change
            </button>
          </Row>
        )}
      </Card>

      {bank && (
        <Card className="py-3">
          <h2 className="text-[18px] font-bold">Your bank</h2>
          <Row last>
            <span>
              <span className="block text-[17px]">{bank.name}</span>
              <span className="block text-[15px] text-ink-2">Connected until {connectedUntil}</span>
            </span>
            <button type="button" className={linkBtn} onClick={() => soon("disconnect your bank")}>
              Disconnect
            </button>
          </Row>
        </Card>
      )}

      {devices && devices.length > 0 && (
        <Card className="py-3">
          <h2 className="text-[18px] font-bold">Where you&apos;re logged in</h2>
          {devices.map((d, i) => (
            <Row key={d.id} last={i === devices.length - 1}>
              <span className="text-[17px]">
                {d.label}
                {!d.current && ` · ${d.last_seen}`}
              </span>
              {d.current ? (
                <span className="text-[15px] text-ink-2">{d.last_seen}</span>
              ) : (
                <button type="button" className={linkBtn} onClick={() => toast(`Logged out of ${d.label}.`)}>
                  Log out
                </button>
              )}
            </Row>
          ))}
        </Card>
      )}

      <Card className="py-3">
        <h2 className="text-[18px] font-bold">Your data</h2>
        <Row>
          <button type="button" onClick={download} className="ix -mx-2 flex min-h-11 flex-1 items-center justify-between rounded-xl px-2 text-[17px] hover:bg-surface-hover">
            Download my data
            <DownloadIcon size={22} aria-hidden />
          </button>
        </Row>
        <div className="py-2">
          <button
            type="button"
            onClick={() => toast("In the full app, deleting starts a 48-hour wait. You can cancel any time.")}
            className="ix inline-flex min-h-11 items-center text-[17px] font-bold text-due hover:underline"
          >
            Delete my account
          </button>
          <p className="text-[15px] text-ink-2">Takes 48 hours. You can cancel.</p>
        </div>
      </Card>

      <Button
        variant="secondary"
        onClick={async () => {
          await api.logout();
          router.push("/login");
        }}
      >
        Log out
      </Button>
    </SubScreen>
  );
}
