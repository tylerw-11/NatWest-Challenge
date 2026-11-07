"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { PactNote, PactRule, Settings } from "./contracts";

export const queryKeys = {
  forecast: ["forecast"] as const,
  rewind: ["rewind"] as const,
  settings: ["settings"] as const,
  me: ["me"] as const,
  pactRules: ["pact"] as const,
  pactNote: ["pact-note"] as const,
  simulate: (asOf: string) => ["simulate", asOf] as const,
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

/** Fast-forward to a date (storm mode). Also refreshes the shared forecast. */
export function useSimulate(asOf: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.simulate(asOf),
    queryFn: async () => {
      const result = await api.simulate(asOf);
      qc.setQueryData(queryKeys.forecast, result.forecast);
      return result;
    },
    staleTime: Infinity,
  });
}

export function useMoveToBuffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => api.moveToBuffer(amount),
    onSuccess: (forecast) => qc.setQueryData(queryKeys.forecast, forecast),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.updateSettings(patch),
    onMutate: (patch) => {
      const prev = qc.getQueryData<Settings>(queryKeys.settings);
      if (prev) qc.setQueryData(queryKeys.settings, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(queryKeys.settings, ctx.prev),
    onSuccess: (settings) => qc.setQueryData(queryKeys.settings, settings),
  });
}
