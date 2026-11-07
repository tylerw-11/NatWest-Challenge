"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/hooks";
import { applyColourMode } from "@/lib/colour-mode";

/** Applies saved settings to the whole app: colour mode and calm mode. */
export function SettingsSync() {
  const { data } = useSettings();
  useEffect(() => {
    if (!data) return;
    applyColourMode(data.colour_mode);
    document.documentElement.dataset.calm = String(data.calm_mode);
  }, [data]);
  return null;
}
