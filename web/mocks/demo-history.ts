import type { BalanceHistoryPoint } from "@/lib/contracts";

/** Deterministic fictional activity for the offline demo, ending at its £240 balance. */
export function generateMockDemoHistory(): BalanceHistoryPoint[] {
  const start = new Date("2025-04-01T12:00:00Z");
  const end = new Date("2026-03-10T12:00:00Z");
  const flows = new Map<string, number>();
  const add = (day: string, amount: number) => flows.set(day, (flows.get(day) ?? 0) + amount);

  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay();
    const dayNumber = Math.floor((day.getTime() - start.getTime()) / 86_400_000);
    if ([2, 4, 6].includes(weekday)) add(date, 45 + ((dayNumber * 37) % 71));
    if (day.getUTCDate() === 1) add(date, -620);
    if (day.getUTCDate() === 6) add(date, -9.83);
    if (day.getUTCDate() === 22) add(date, -45);
    if (day.getUTCDate() === 23) add(date, -118);
  }

  const history: BalanceHistoryPoint[] = [];
  let balance = 240;
  for (let day = new Date(end); day >= start; day.setUTCDate(day.getUTCDate() - 1)) {
    const date = day.toISOString().slice(0, 10);
    history.push({ date, balance_gbp: Math.round(balance * 100) / 100 });
    balance -= flows.get(date) ?? 0;
  }
  return history.reverse();
}
