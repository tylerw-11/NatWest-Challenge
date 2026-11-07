import { cn } from "@/lib/utils";

const CAPTURE = process.env.NEXT_PUBLIC_CAPTURE === "true";

/**
 * Mobile-first 390 px column. On a phone it is full width; on a desktop it is
 * centred. With CAPTURE=true it is locked to 390×844 for video capture.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[390px] bg-bg",
        CAPTURE ? "h-[844px] w-[390px] overflow-y-auto" : "min-h-dvh",
      )}
    >
      {children}
    </div>
  );
}
