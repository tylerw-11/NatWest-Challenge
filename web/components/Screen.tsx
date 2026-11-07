import { BottomNav } from "./BottomNav";
import { SubHeader, TabHeader } from "./Header";

/**
 * Layout shells so every screen has the same structure:
 * page padding 20, 16 between sections.
 */
export function TabScreen({
  title,
  emoji,
  showSettings,
  children,
}: {
  title: string;
  emoji?: string;
  showSettings?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TabHeader title={title} emoji={emoji} showSettings={showSettings} />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-3 pb-6">{children}</main>
      <BottomNav />
    </div>
  );
}

export function SubScreen({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SubHeader title={title} backHref={backHref} />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-3 pb-8">{children}</main>
    </div>
  );
}
