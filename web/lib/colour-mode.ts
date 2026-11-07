"use client";

import type { ColourMode } from "./contracts";

/** Switches the token set. Settings > Colours will call this (Feature 9). */
export function applyColourMode(mode: ColourMode) {
  document.documentElement.dataset.colourMode = mode;
}
