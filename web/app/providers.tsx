"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { PresenterKeys } from "@/components/PresenterKeys";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <PresenterKeys />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
