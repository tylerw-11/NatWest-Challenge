"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const queryKeys = {
  forecast: ["forecast"] as const,
  rewind: ["rewind"] as const,
  settings: ["settings"] as const,
  me: ["me"] as const,
  pactRules: ["pact"] as const,
};

export const useForecast = () =>
  useQuery({ queryKey: queryKeys.forecast, queryFn: api.forecast });

export const useRewind = () =>
  useQuery({ queryKey: queryKeys.rewind, queryFn: api.rewind });

export const useSettings = () =>
  useQuery({ queryKey: queryKeys.settings, queryFn: api.settings });

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: api.me });

export const usePactRules = () =>
  useQuery({ queryKey: queryKeys.pactRules, queryFn: api.pactRules });
