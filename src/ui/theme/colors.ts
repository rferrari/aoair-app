import { ThemeId } from "../../models/settings";

/**
 * BOAR Design System — Curated Themes
 * 1. Midnight Slate (Default: OLED Black + Emerald Status)
 * 2. Amber Phosphor (Night Field Operations / Vintage CRT Amber Glow)
 * 3. Frontier Cyan (Outdoor Sunlight Contrast / Electric Cyan Lab)
 */

export const midnightTheme = {
  id: "midnight" as ThemeId,
  name: "Midnight Slate",
  icon: "🐗",
  description: "OLED dark mode with emerald telemetry",
  bg: {
    black: "#000000",
    terminal: "#080C14",
    surface: "#0B0F19",
    card: "#0F172A",
    cardElevated: "#131D31",
    cardHover: "#1E293B",
    input: "#0A0E17",
    subtle: "rgba(255, 255, 255, 0.03)",
    overlay: "rgba(2, 6, 23, 0.78)",
    modalOverlay: "rgba(0, 0, 0, 0.85)",
  },
  border: {
    subtle: "rgba(255, 255, 255, 0.07)",
    default: "#1E293B",
    elevated: "#334155",
    focus: "#06B6D4",
    emerald: "rgba(16, 185, 129, 0.35)",
    cyan: "rgba(6, 182, 212, 0.35)",
    amber: "rgba(245, 158, 11, 0.4)",
    danger: "rgba(239, 68, 68, 0.4)",
    frontier: "rgba(139, 92, 246, 0.45)",
  },
  text: {
    primary: "#FFFFFF",
    heading: "#F8FAFC",
    secondary: "#CBD5E1",
    muted: "#94A3B8",
    dim: "#64748B",
    inverse: "#020617",
    accentEmerald: "#34D399",
    accentCyan: "#38BDF8",
    accentAmber: "#FBBF24",
    accentViolet: "#C084FC",
  },
  emerald: {
    50: "#ECFDF5",
    400: "#34D399",
    500: "#10B981",
    600: "#059669",
    900: "#064E3B",
    bgSubtle: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.28)",
  },
  cyan: {
    400: "#22D3EE",
    500: "#06B6D4",
    600: "#0891B2",
    bgSubtle: "rgba(6, 182, 212, 0.12)",
    border: "rgba(6, 182, 212, 0.3)",
  },
  frontier: {
    glow: "#8B5CF6",
    glowCyan: "#06B6D4",
    badgeBg: "rgba(139, 92, 246, 0.18)",
    badgeBorder: "rgba(139, 92, 246, 0.45)",
    text: "#C4B5FD",
    gradientStart: "#1E1138",
    gradientEnd: "#081E2C",
  },
  amber: {
    400: "#FBBF24",
    500: "#F59E0B",
    600: "#D97706",
    bgSubtle: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  crimson: {
    400: "#F87171",
    500: "#EF4444",
    600: "#DC2626",
    900: "#7F1D1D",
    bgSubtle: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
  },
};

export const amberTheme = {
  id: "amber" as ThemeId,
  name: "Amber Phosphor",
  icon: "⚡",
  description: "Warm night-vision CRT with zero blue-light strain",
  bg: {
    black: "#050402",
    terminal: "#0C0A04",
    surface: "#141008",
    card: "#1D160A",
    cardElevated: "#281F0E",
    cardHover: "#352A14",
    input: "#0F0C06",
    subtle: "rgba(245, 158, 11, 0.04)",
    overlay: "rgba(12, 10, 4, 0.82)",
    modalOverlay: "rgba(0, 0, 0, 0.88)",
  },
  border: {
    subtle: "rgba(245, 158, 11, 0.12)",
    default: "#3D2E12",
    elevated: "#5A441B",
    focus: "#F59E0B",
    emerald: "rgba(245, 158, 11, 0.4)",
    cyan: "rgba(251, 191, 36, 0.4)",
    amber: "rgba(245, 158, 11, 0.5)",
    danger: "rgba(239, 68, 68, 0.45)",
    frontier: "rgba(217, 119, 6, 0.5)",
  },
  text: {
    primary: "#FFFBEB",
    heading: "#FEF3C7",
    secondary: "#FDE68A",
    muted: "#D97706",
    dim: "#92400E",
    inverse: "#141008",
    accentEmerald: "#FBBF24",
    accentCyan: "#F59E0B",
    accentAmber: "#F59E0B",
    accentViolet: "#FCD34D",
  },
  emerald: {
    50: "#FFFBEB",
    400: "#FBBF24",
    500: "#F59E0B",
    600: "#D97706",
    900: "#78350F",
    bgSubtle: "rgba(245, 158, 11, 0.14)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  cyan: {
    400: "#FCD34D",
    500: "#FBBF24",
    600: "#F59E0B",
    bgSubtle: "rgba(251, 191, 36, 0.12)",
    border: "rgba(251, 191, 36, 0.3)",
  },
  frontier: {
    glow: "#F59E0B",
    glowCyan: "#FBBF24",
    badgeBg: "rgba(245, 158, 11, 0.2)",
    badgeBorder: "rgba(245, 158, 11, 0.5)",
    text: "#FEF3C7",
    gradientStart: "#281804",
    gradientEnd: "#120B02",
  },
  amber: {
    400: "#FCD34D",
    500: "#FBBF24",
    600: "#F59E0B",
    bgSubtle: "rgba(245, 158, 11, 0.16)",
    border: "rgba(245, 158, 11, 0.4)",
  },
  crimson: {
    400: "#F87171",
    500: "#EF4444",
    600: "#DC2626",
    900: "#7F1D1D",
    bgSubtle: "rgba(239, 68, 68, 0.14)",
    border: "rgba(239, 68, 68, 0.4)",
  },
};

export const frontierTheme = {
  id: "frontier" as ThemeId,
  name: "Frontier Cyan",
  icon: "🔬",
  description: "High-contrast cyber navy for outdoor sunlight readability",
  bg: {
    black: "#020712",
    terminal: "#040B1A",
    surface: "#071228",
    card: "#0C1B38",
    cardElevated: "#11244A",
    cardHover: "#183262",
    input: "#050F22",
    subtle: "rgba(6, 182, 212, 0.04)",
    overlay: "rgba(3, 10, 24, 0.8)",
    modalOverlay: "rgba(1, 5, 14, 0.88)",
  },
  border: {
    subtle: "rgba(6, 182, 212, 0.12)",
    default: "#16315C",
    elevated: "#234680",
    focus: "#06B6D4",
    emerald: "rgba(16, 185, 129, 0.35)",
    cyan: "rgba(6, 182, 212, 0.45)",
    amber: "rgba(245, 158, 11, 0.4)",
    danger: "rgba(239, 68, 68, 0.4)",
    frontier: "rgba(139, 92, 246, 0.45)",
  },
  text: {
    primary: "#FFFFFF",
    heading: "#F0F9FF",
    secondary: "#BAE6FD",
    muted: "#38BDF8",
    dim: "#0284C7",
    inverse: "#040B1A",
    accentEmerald: "#34D399",
    accentCyan: "#38BDF8",
    accentAmber: "#FBBF24",
    accentViolet: "#C084FC",
  },
  emerald: {
    50: "#ECFDF5",
    400: "#34D399",
    500: "#10B981",
    600: "#059669",
    900: "#064E3B",
    bgSubtle: "rgba(16, 185, 129, 0.15)",
    border: "rgba(16, 185, 129, 0.35)",
  },
  cyan: {
    400: "#38BDF8",
    500: "#06B6D4",
    600: "#0284C7",
    bgSubtle: "rgba(6, 182, 212, 0.18)",
    border: "rgba(6, 182, 212, 0.45)",
  },
  frontier: {
    glow: "#06B6D4",
    glowCyan: "#38BDF8",
    badgeBg: "rgba(6, 182, 212, 0.22)",
    badgeBorder: "rgba(6, 182, 212, 0.5)",
    text: "#E0F2FE",
    gradientStart: "#0B264F",
    gradientEnd: "#040F22",
  },
  amber: {
    400: "#FBBF24",
    500: "#F59E0B",
    600: "#D97706",
    bgSubtle: "rgba(245, 158, 11, 0.14)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  crimson: {
    400: "#F87171",
    500: "#EF4444",
    600: "#DC2626",
    900: "#7F1D1D",
    bgSubtle: "rgba(239, 68, 68, 0.14)",
    border: "rgba(239, 68, 68, 0.35)",
  },
};

export const THEMES = [midnightTheme, amberTheme, frontierTheme] as const;

export function getThemeColors(id: ThemeId = "midnight") {
  switch (id) {
    case "amber":
      return amberTheme;
    case "frontier":
      return frontierTheme;
    case "midnight":
    default:
      return midnightTheme;
  }
}

// Default export matching standard tokens
export const colors = midnightTheme;
export type Colors = typeof midnightTheme;
