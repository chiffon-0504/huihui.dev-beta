export const supportedLocales = ["zh-Hant", "en", "ja"] as const;
export type Locale = (typeof supportedLocales)[number];

export interface HomeTopic {
  readonly title: string;
  readonly description: string;
}

export interface LocaleContent {
  readonly language: { readonly label: string; readonly shortLabel: string };
  readonly skip: string;
  readonly navigation: string;
  readonly languages: string;
  readonly theme: string;
  readonly themeAuto: string;
  readonly themeLight: string;
  readonly themeDark: string;
  readonly title: string;
  readonly introduction: string;
  readonly heroWorksCta: string;
  readonly heroAboutCta: string;
  readonly worksLabel: string;
  readonly aboutLabel: string;
  readonly works: string;
  readonly worksHeading: string;
  readonly focusLabel: string;
  readonly focus: readonly HomeTopic[];
  readonly principlesLabel: string;
  readonly principlesIntroduction: string;
  readonly principles: readonly HomeTopic[];
  readonly skillsLabel: string;
  readonly skills: readonly HomeTopic[];
  readonly interestsLabel: string;
  readonly interestsIntroduction: string;
  readonly interests: readonly HomeTopic[];
  readonly aboutCta: string;
  readonly worksCta: string;
  readonly currentSite: string;
  readonly websiteTitle: string;
  readonly websiteDescription: string;
  readonly websiteCta: string;
  readonly toolTitle: string;
  readonly toolDescription: string;
  readonly toolCta: string;
}
