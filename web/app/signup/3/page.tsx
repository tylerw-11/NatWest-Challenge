"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Cards";
import { Button, TextLink } from "@/components/Buttons";
import { ApiError } from "@/lib/api";
import { useSaveProfile } from "@/lib/hooks";
import type { BillSchedule, Frequency, Profile } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
  { value: "once", label: "Just once" },
];

const field =
  "min-h-12 w-full rounded-2xl border border-ink-2 bg-surface px-4 text-[17px] text-ink focus-visible:outline-3 focus-visible:outline-primary";
const labelCls = "flex flex-col gap-1 text-[16px] font-bold";

type BillRow = { key: number; label: string; amount: string; due: string; frequency: Frequency };

const blankBill = (key: number): BillRow => ({ key, label: "", amount: "", due: "", frequency: "monthly" });

/** "12.50" → 12.5; anything that is not a number ≥ 0 → null. */
function money(v: string): number | null {
  const n = Number(v.replace(/[£,\s]/g, ""));
  return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

export default function SignupStep3() {
  const router = useRouter();
  const save = useSaveProfile();
  const [balance, setBalance] = useState("");
  const [payLabel, setPayLabel] = useState("Pay");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payFreq, setPayFreq] = useState<Frequency>("monthly");
  const [payVaries, setPayVaries] = useState(false);
  const [bills, setBills] = useState<BillRow[]>([blankBill(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const setBill = (key: number, patch: Partial<BillRow>) =>
    setBills((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Build the profile, or return a plain sentence saying what to fix. */
  function build(): Profile | string {
    const bal = Number(balance.replace(/[£,\s]/g, ""));
    if (balance.trim() === "" || !Number.isFinite(bal)) return "Add the money in your account today. Use 0 if you're not sure.";
    const pay = money(payAmount);
    const hasPay = payAmount.trim() !== "" || payDate !== "";
    if (hasPay && (pay === null || pay <= 0)) return "Add how much your pay is, as a number above 0.";
    if (hasPay && !payDate) return "Add the date of your next pay.";
    const filled = bills.filter((b) => b.label.trim() || b.amount.trim() || b.due);
    const out: BillSchedule[] = [];
    for (const b of filled) {
      const amount = money(b.amount);
      if (!b.label.trim()) return "Give each bill a name, like Rent or Phone.";
      if (amount === null || amount <= 0) return `Add how much ${b.label.trim()} costs, as a number above 0.`;
      if (!b.due) return `Add when ${b.label.trim()} is next due.`;
      out.push({ label: b.label.trim(), amount_gbp: amount, due_date: b.due, frequency: b.frequency });
    }
    return {
      current_balance_gbp: bal,
      incomes: hasPay
        ? [
            {
              label: payLabel.trim() || "Pay",
              amount_gbp: pay as number,
              next_pay_date: payDate,
              frequency: payFreq,
              variability_pct: payVaries ? 0.25 : 0,
            },
          ]
        : [],
      bills: out,
    };
  }

  const submit = () => {
    const p = build();
    if (typeof p === "string") {
      setError(p);
      return;
    }
    setError(null);
    save.mutate(p, {
      onSuccess: () => router.push("/"),
      onError: (e) => setError(e instanceof ApiError ? e.message_plain : "We could not save that. Please try again."),
    });
  };

  return (
    <SubScreen title="Step 3 of 3" backHref="/signup/2">
      <div aria-label="Step 3 of 3" role="img" className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((n) => (
          <span key={n} className="h-2 rounded-full bg-primary" />
        ))}
      </div>

      <HeroCard
        tone="teal"
        eyebrow="Your money"
        headline="What comes in and goes out?"
        body="Pact uses this to forecast your next 60 days. Only you see it."
        icon={<span aria-hidden className="text-[60px] leading-none">🧾</span>}
      />

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <Card className="flex flex-col gap-3 py-4">
          <label className={labelCls}>
            Money in your account today (£)
            <input
              id="balance"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className={field}
            />
          </label>
        </Card>

        <Card className="flex flex-col gap-3 py-4">
          <h2 className="text-[18px] font-bold">Your pay</h2>
          <label className={labelCls}>
            What is it called?
            <input id="pay-label" value={payLabel} onChange={(e) => setPayLabel(e.target.value)} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              How much (£)
              <input
                id="pay-amount"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className={field}
              />
            </label>
            <label className={labelCls}>
              Next pay day
              <input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={field} />
            </label>
          </div>
          <label className={labelCls}>
            How often
            <select
              id="pay-frequency"
              value={payFreq}
              onChange={(e) => setPayFreq(e.target.value as Frequency)}
              className={field}
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[17px]">
            <input
              id="pay-varies"
              type="checkbox"
              checked={payVaries}
              onChange={(e) => setPayVaries(e.target.checked)}
              className="size-7 accent-primary"
            />
            My pay changes a lot
          </label>
        </Card>

        <Card className="flex flex-col gap-3 py-4">
          <h2 className="text-[18px] font-bold">Your bills</h2>
          {bills.map((b, i) => (
            <fieldset key={b.key} className={cn("flex flex-col gap-3", i > 0 && "border-t border-divider pt-3")}>
              <legend className="sr-only">Bill {i + 1}</legend>
              <label className={labelCls}>
                Name
                <input
                  id={`bill-${b.key}-label`}
                  value={b.label}
                  placeholder="Rent, phone, council tax…"
                  onChange={(e) => setBill(b.key, { label: e.target.value })}
                  className={field}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  How much (£)
                  <input
                    id={`bill-${b.key}-amount`}
                    inputMode="decimal"
                    value={b.amount}
                    onChange={(e) => setBill(b.key, { amount: e.target.value })}
                    className={field}
                  />
                </label>
                <label className={labelCls}>
                  Next due
                  <input
                    id={`bill-${b.key}-due`}
                    type="date"
                    value={b.due}
                    onChange={(e) => setBill(b.key, { due: e.target.value })}
                    className={field}
                  />
                </label>
              </div>
              <div className="flex items-end gap-3">
                <label className={cn(labelCls, "flex-1")}>
                  How often
                  <select
                    id={`bill-${b.key}-frequency`}
                    value={b.frequency}
                    onChange={(e) => setBill(b.key, { frequency: e.target.value as Frequency })}
                    className={field}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setBills((rows) => rows.filter((r) => r.key !== b.key))}
                  className="ix ix-press-sm inline-flex min-h-12 items-center rounded-full border border-border bg-surface px-4 font-bold text-due hover:border-due"
                >
                  Remove<span className="sr-only"> bill {i + 1}</span>
                </button>
              </div>
            </fieldset>
          ))}
          <Button
            variant="secondary"
            onClick={() => {
              setBills((rows) => [...rows, blankBill(nextKey)]);
              setNextKey((k) => k + 1);
            }}
          >
            Add a bill
          </Button>
        </Card>

        {error && (
          <p role="alert" className="text-[16px] font-bold text-due">
            {error}
          </p>
        )}

        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Working it out…" : "See my forecast"}
        </Button>
        <div className="text-center">
          <TextLink href="/">Skip for now</TextLink>
        </div>
      </form>
    </SubScreen>
  );
}
