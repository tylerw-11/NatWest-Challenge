"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { PactNote, PactRule } from "./contracts";

export const queryKeys = {
  forecast: ["forecast"] as const,
  rewind: ["rewind"] as const,
  settings: ["settings"] as const,
  me: ["me"] as const,
  pactRules: ["pact"] as const,
  pactNote: ["pact-note"] as const,
};

export const useForecast = () => useQuery({ queryKey: queryKeys.forecast, queryFn: api.forecast });

export const useRewind = () => useQuery({ queryKey: queryKeys.rewind, queryFn: api.rewind });

export const useSettings = () => useQuery({ queryKey: queryKeys.settings, queryFn: api.settings });

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: api.me });

export const usePactRules = () => useQuery({ queryKey: queryKeys.pactRules, queryFn: api.pactRules });

export const usePactNote = () => useQuery({ queryKey: queryKeys.pactNote, queryFn: api.pactNote });

export const useParsePact = () => useMutation({ mutationFn: (text: string) => api.parsePact(text) });

export function useSavePact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rules, note }: { rules: PactRule[]; note: PactNote | null }) =>
      Promise.all([api.savePact(rules), note ? api.saveNote(note) : Promise.resolve(null)]),
    onSuccess: ([rules, note]) => {
      qc.setQueryData(queryKeys.pactRules, rules);
      if (note) qc.setQueryData(queryKeys.pactNote, note);
    },
  });
}
