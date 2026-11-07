"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { resetMockState } from "@/lib/mock-store";

/**
 * Hidden presenter controls for the demo (not shown in the UI):
 *   Shift+F  fast-forward to Fri 13 March (payday) and open Storm mode
 *   Shift+R  reset the demo to Tue 10 March with no pact
 */
export function PresenterKeys() {
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (!e.shiftKey || el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "F") {
        router.push("/storm?as_of=2026-03-13");
      } else if (e.key === "R") {
        resetMockState();
        qc.clear();
        router.push("/");
        toast("Demo reset to Tue 10 March.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, qc]);

  return null;
}
