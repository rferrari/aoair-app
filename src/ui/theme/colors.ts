/**
 * BOAR Design System — Colors & Palette
 * Aesthetic: "Off-Grid Field Terminal meets Frontier AI Lab"
 *
 * Designed with deep OLED dark-mode defaults (#0B0F19, #020617),
 * emerald/cyan status accents, warm bronze/amber warnings,
 * and outdoor-grade AAA contrast ratios for sunlight readability.
 */

export const colors = {
  // Base backgrounds (OLED-optimized, slate/charcoal depths)
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

  // Borders & Dividers
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

  // AAA Contrast Typography (Optimized for outdoor and bright sunlight)
  text: {
    primary: "#FFFFFF",        // 16.5:1 against #0F172A (Exceeds AAA 7:1)
    heading: "#F8FAFC",        // Slate 50
    secondary: "#CBD5E1",      // Slate 300 (9.2:1 against #0F172A, passes AAA)
    muted: "#94A3B8",          // Slate 400 (5.8:1, passes AAA for bold / large text)
    dim: "#64748B",            // Slate 500 (tertiary / placeholders)
    inverse: "#020617",        // Inverse dark text on light badges
    accentEmerald: "#34D399",  // Mint/Emerald Neon
    accentCyan: "#38BDF8",     // Cyan/Sky
    accentAmber: "#FBBF24",    // Amber Neon
    accentViolet: "#C084FC",   // Frontier Violet
  },

  // Emerald & Offline Core Status Accents
  emerald: {
    50: "#ECFDF5",
    400: "#34D399",
    500: "#10B981",
    600: "#059669",
    900: "#064E3B",
    bgSubtle: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.28)",
  },

  // Frontier AI Lab / Cyan Accents
  cyan: {
    400: "#22D3EE",
    500: "#06B6D4",
    600: "#0891B2",
    bgSubtle: "rgba(6, 182, 212, 0.12)",
    border: "rgba(6, 182, 212, 0.3)",
  },

  // Deep Research & Mixture of Agents (Frontier Violet)
  frontier: {
    glow: "#8B5CF6",
    glowCyan: "#06B6D4",
    badgeBg: "rgba(139, 92, 246, 0.18)",
    badgeBorder: "rgba(139, 92, 246, 0.45)",
    text: "#C4B5FD",
    gradientStart: "#1E1138",
    gradientEnd: "#081E2C",
  },

  // Amber / Warm Bronze (Telemetry warnings, High RAM)
  amber: {
    400: "#FBBF24",
    500: "#F59E0B",
    600: "#D97706",
    bgSubtle: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
  },

  // Crimson & Danger Zone (Reset, Incompatible, Purge)
  crimson: {
    400: "#F87171",
    500: "#EF4444",
    600: "#DC2626",
    900: "#7F1D1D",
    bgSubtle: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
  },
} as const;

export type Colors = typeof colors;
