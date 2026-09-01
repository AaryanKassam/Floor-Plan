/**
 * Curated seat colours. Deliberately a fixed palette rather than a free colour
 * picker: every option stays muted (no neon, no pastel) and keeps enough
 * contrast for the white table number sitting on top.
 */
export interface Swatch {
  id: string;
  label: string;
  hex: string;
}

export const FREE_COLORS: Swatch[] = [
  { id: "sage", label: "Sage", hex: "#4A6B4F" },
  { id: "pine", label: "Pine", hex: "#2F5D4A" },
  { id: "teal", label: "Teal", hex: "#3F6B63" },
  { id: "olive", label: "Olive", hex: "#5C6B3F" },
  { id: "slate", label: "Slate", hex: "#40566B" },
  { id: "verdigris", label: "Verdigris", hex: "#4F6B6B" },
];

export const BOOKED_COLORS: Swatch[] = [
  { id: "oxblood", label: "Oxblood", hex: "#8C3A2E" },
  { id: "rust", label: "Rust", hex: "#7A3428" },
  { id: "terracotta", label: "Terracotta", hex: "#A45A34" },
  { id: "burgundy", label: "Burgundy", hex: "#6E2F3A" },
  { id: "cocoa", label: "Cocoa", hex: "#5E3B33" },
  { id: "clay", label: "Clay", hex: "#8A4B2F" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Only allow colours from the curated palette. */
export function isAllowedFree(hex: string): boolean {
  return HEX.test(hex) && FREE_COLORS.some((c) => c.hex.toLowerCase() === hex.toLowerCase());
}

export function isAllowedBooked(hex: string): boolean {
  return HEX.test(hex) && BOOKED_COLORS.some((c) => c.hex.toLowerCase() === hex.toLowerCase());
}
