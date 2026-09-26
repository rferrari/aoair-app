/**
 * Which Android build this JS bundle belongs to. Set at build time from
 * EXPO_PUBLIC_BOAR_VARIANT (Expo inlines EXPO_PUBLIC_* into the bundle), the
 * same variable app.config.ts reads to decide which permissions the APK
 * declares, so native and JS always agree. See docs/BUILD_VARIANTS.md.
 *
 * - "downloader" (default): declares INTERNET; assets are downloaded in-app.
 * - "offline": no INTERNET permission; assets are imported from files.
 */
export type AppVariant = "offline" | "downloader";

export function parseVariant(raw: string | undefined): AppVariant {
  return raw?.trim().toLowerCase() === "offline" ? "offline" : "downloader";
}

export const APP_VARIANT: AppVariant = parseVariant(process.env.EXPO_PUBLIC_BOAR_VARIANT);

/** False in the offline build: every network code path must check this first. */
export function networkAllowed(): boolean {
  return APP_VARIANT !== "offline";
}
