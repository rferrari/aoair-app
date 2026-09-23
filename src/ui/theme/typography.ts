import { Platform, TextStyle } from "react-native";

export const fontFamilies = {
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
  sans: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "sans-serif",
  }),
};

export const typography = {
  // Ultra-readable monospace styles for telemetry, hardware specs & tok/s
  mono: {
    xs: {
      fontFamily: fontFamilies.mono,
      fontSize: 10,
      lineHeight: 14,
      letterSpacing: 0.5,
    } as TextStyle,
    sm: {
      fontFamily: fontFamilies.mono,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.25,
    } as TextStyle,
    base: {
      fontFamily: fontFamilies.mono,
      fontSize: 13,
      lineHeight: 18,
    } as TextStyle,
    md: {
      fontFamily: fontFamilies.mono,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "600",
    } as TextStyle,
    lg: {
      fontFamily: fontFamilies.mono,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "700",
    } as TextStyle,
  },

  // Sans-serif for chat messages, reading logs, prompts, and UI headers
  ui: {
    micro: {
      fontFamily: fontFamilies.sans,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "600",
    } as TextStyle,
    caption: {
      fontFamily: fontFamilies.sans,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "500",
    } as TextStyle,
    subtext: {
      fontFamily: fontFamilies.sans,
      fontSize: 12,
      lineHeight: 16,
    } as TextStyle,
    body: {
      fontFamily: fontFamilies.sans,
      fontSize: 14,
      lineHeight: 21,
    } as TextStyle,
    bodyLg: {
      fontFamily: fontFamilies.sans,
      fontSize: 15,
      lineHeight: 22,
    } as TextStyle,
    titleSm: {
      fontFamily: fontFamilies.sans,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "700",
    } as TextStyle,
    title: {
      fontFamily: fontFamilies.sans,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700",
    } as TextStyle,
    titleLg: {
      fontFamily: fontFamilies.sans,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: "800",
    } as TextStyle,
    headline: {
      fontFamily: fontFamilies.sans,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "900",
      letterSpacing: -0.3,
    } as TextStyle,
  },
};
