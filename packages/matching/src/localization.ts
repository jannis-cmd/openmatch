export const SUPPORTED_LOCALES = ["de", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "de";

/** Resolve BCP 47 language tags while keeping the catalog open for new locales. */
export function resolveLocale(
  requested: string | readonly string[] | null | undefined,
  fallback: SupportedLocale = DEFAULT_LOCALE,
): SupportedLocale {
  const tags = Array.isArray(requested)
    ? requested
    : typeof requested === "string"
      ? [requested]
      : [];
  for (const tag of tags) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (SUPPORTED_LOCALES.includes(base as SupportedLocale))
      return base as SupportedLocale;
  }
  return fallback;
}

export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  de: "Deutsch",
  en: "English",
};
