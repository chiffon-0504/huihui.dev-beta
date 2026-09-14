export const supportedLocales = ["zh-Hant", "en", "ja"] as const;
export type Locale = (typeof supportedLocales)[number];

export interface LocaleContent {
  readonly language: { readonly label: string; readonly shortLabel: string };
  readonly skip: string;
  readonly navigation: string;
  readonly languages: string;
  readonly theme: string;
  readonly themeAuto: string;
  readonly themeLight: string;
  readonly themeDark: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly introduction: string;
  readonly heroWorksCta: string;
  readonly heroAboutCta: string;
  readonly worksLabel: string;
  readonly aboutLabel: string;
  readonly works: string;
  readonly about: string;
  readonly aboutLead: string;
  readonly aboutInterests: string;
  readonly aboutCta: string;
  readonly worksCta: string;
  readonly currentSite: string;
  readonly websiteCategory: string;
  readonly websiteTitle: string;
  readonly websiteDescription: string;
  readonly websiteCta: string;
  readonly toolCategory: string;
  readonly toolTitle: string;
  readonly toolDescription: string;
  readonly toolCta: string;
}
