export const supportedLocales = ["zh-Hant", "en", "ja"] as const;
export type Locale = (typeof supportedLocales)[number];
export type Page = "home" | "about";

export interface AboutContent {
  readonly title: string;
  readonly description: string;
  readonly noScript: string;
  readonly introduction: string;
  readonly backgroundTitle: string;
  readonly background: readonly string[];
  readonly practiceTitle: string;
  readonly practice: readonly HomeTopic[];
  readonly interestsTitle: string;
  readonly interests: readonly HomeTopic[];
  readonly musicTitle: string;
  readonly music: readonly HomeTopic[];
  readonly worksCta: string;
}

export interface HomeTopic {
  readonly title: string;
  readonly description: string;
}

export interface LocaleContent {
  readonly aboutPage: AboutContent;
  readonly contact: { readonly label: string; readonly email: string };
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
