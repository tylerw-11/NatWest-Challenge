"use client";

import { Translated } from "@/components/Translated";
import { TabScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Card, ListCard, TipCard } from "@/components/Cards";
import { LineChart } from "@/components/LineChart";
import { FallbackCard, Skeleton } from "@/components/Fallback";
import { RewindClockIcon } from "@/components/illustrations";
import { useRewind } from "@/lib/hooks";
import { gbp } from "@/lib/format";
import type { Rewind } from "@/lib/contracts";

const monthName = (ym: string, style: "short" | "long" = "short") =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: style, timeZone: "UTC" });

function RewindBody({ rewind }: { rewind: Rewind }) {
  const peak = rewind.months.reduce((best, m, i) => (m.extra_gbp > rewind.months[best].extra_gbp ? i : best), 0);
  const peakMonth = rewind.months[peak];
  const first = rewind.months[0];
  const last = rewind.months[rewind.months.length - 1];
  const insurance = rewind.categories.find((c) => c.id === "cat_insurance_monthly");

  return (
    <>
      <HeroCard
        tone="rewind"
        eyebrow="Last 12 months"
        headline={`${gbp(rewind.total_gbp)} extra, just for being short`}
        body={
          <>
            Not your fault. It costs more to have less. <span aria-hidden>💛</span>
          </>
        }
        icon={<RewindClockIcon />}
      >
        <Translated k="rewind_extra" vars={{ amount: rewind.total_gbp }} className="mt-3" />
      </HeroCard>

      <Card className="flex flex-col gap-4 px-5">
        <h2 className="text-[15px] font-bold">Extra costs by month</h2>
        <LineChart
          mode="area"
          points={rewind.months.map((m) => ({ y: m.extra_gbp }))}
          keyIndex={peak}
          labels={{
            start: monthName(first.month),
            key: `${monthName(peakMonth.month)} · ${gbp(peakMonth.extra_gbp)}`,
            end: monthName(last.month),
          }}
          ariaLabel={`Extra costs each month from ${monthName(first.month, "long")} to ${monthName(
            last.month,
            "long",
          )}, ${gbp(rewind.total_gbp)} in total. The most was ${gbp(peakMonth.extra_gbp)} in ${monthName(
            peakMonth.month,
            "long",
          )}.`}
        />
      </Card>

      <ListCard
        heading="Where it went"
        rows={rewind.categories.map((c) => ({ id: c.id, label: c.label, value: gbp(c.total_gbp) }))}
        details={
          <ul className="flex flex-col gap-2">
            {rewind.categories.map((c) => (
              <li key={c.id}>
                <b>{c.label}:</b> {c.source_note}
              </li>
            ))}
          </ul>
        }
      />

      <TipCard>
        With your pact, you&apos;d have kept <b>about {gbp(rewind.kept_with_pact_gbp)}.</b>
        {insurance && <> Paying insurance yearly saves {gbp(insurance.total_gbp)} more.</>}
      </TipCard>
    </>
  );
}

export default function RewindPage() {
  const rewind = useRewind();
  return (
    <TabScreen title="Rewind">
      {rewind.isPending ? (
        <Skeleton />
      ) : rewind.isError ? (
        <FallbackCard error={rewind.error} onRetry={() => rewind.refetch()} />
      ) : (
        <RewindBody rewind={rewind.data} />
      )}
    </TabScreen>
  );
}
