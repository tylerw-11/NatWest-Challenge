"use client";

import { ApiError } from "@/lib/api";
import { Button } from "./Buttons";
import { Card } from "./Cards";

/** Quiet placeholder blocks while data loads. */
export function Skeleton({ blocks = 4 }: { blocks?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <div className="h-36 animate-pulse rounded-hero bg-divider" />
      {Array.from({ length: blocks - 1 }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-card bg-divider" />
      ))}
    </div>
  );
}

/** Plain-language error card with a retry button (message at reading age 9). */
export function FallbackCard({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError ? error.message_plain : "We could not load this right now. Please try again.";
  return (
    <Card className="flex flex-col gap-4">
      <p role="alert" className="text-[16px]">
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}
