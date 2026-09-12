export const locales = ["zh-Hant", "en", "ja"] as const;
export type Locale = (typeof locales)[number];

interface Content {
  readonly skip: string;
  readonly navigation: string;
  readonly languages: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly introduction: string;
  readonly upcoming: string;
  readonly worksLabel: string;
  readonly aboutLabel: string;
  readonly works: string;
  readonly about: string;
}

export const content: Readonly<Record<Locale, Content>> = {
  "zh-Hant": {
    skip: "跳至主要內容",
    navigation: "主要導覽",
    languages: "語言",
    eyebrow: "開發者作品集",
    title: "以程式解決問題，讓想法成為作品。",
    introduction: "這裡將分享精選專案、開發實踐，以及作品背後的思考。",
    upcoming: "即將推出",
    worksLabel: "作品",
    aboutLabel: "關於",
    works: "精選作品與專案紀錄將在這裡呈現。",
    about: "開發背景、工作方式與個人簡介將在這裡呈現。",
  },
  en: {
    skip: "Skip to main content",
    navigation: "Main navigation",
    languages: "Language",
    eyebrow: "Developer portfolio",
    title: "Solving problems. Building ideas.",
    introduction: "A space for selected projects, development practice, and the thinking behind the work.",
    upcoming: "Coming soon",
    worksLabel: "Works",
    aboutLabel: "About",
    works: "Selected work and project notes will appear here.",
    about: "Development background, approach, and a short introduction will appear here.",
  },
  ja: {
    skip: "メインコンテンツへ移動",
    navigation: "メインナビゲーション",
    languages: "言語",
    eyebrow: "開発者ポートフォリオ",
    title: "コードで課題を解き、アイデアを形に。",
    introduction: "制作したプロジェクト、開発の実践、そして作品に込めた考えを紹介していきます。",
    upcoming: "近日公開",
    worksLabel: "制作実績",
    aboutLabel: "プロフィール",
    works: "制作実績とプロジェクトの記録を掲載する予定です。",
    about: "開発の背景や取り組み方、プロフィールを掲載する予定です。",
  },
};

export const localeLinks: Readonly<Record<Locale, { readonly href: string; readonly label: string }>> = {
  "zh-Hant": { href: "/", label: "繁體中文" },
  en: { href: "/en/", label: "English" },
  ja: { href: "/ja/", label: "日本語" },
};

export function resolveLocale(language: string): Locale {
  return locales.find((locale) => locale === language) ?? "zh-Hant";
}
