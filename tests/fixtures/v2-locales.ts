import { getContent, localeHref, locales, type Locale, type LocaleContent } from "../../v2/src/locales";
import zhHant from "../../v2/src/locales/zh-Hant";
import en from "../../v2/src/locales/en";
import ja from "../../v2/src/locales/ja";

// Compile the real modules and consumer API against the one public schema.
export const complete: Readonly<Record<Locale, LocaleContent>> = { "zh-Hant": zhHant, en, ja };
export const selected: LocaleContent = getContent("en");
export const link: string = localeHref("ja", "#works");

const { skip, ...missingAccessibility } = en;
void skip;
// @ts-expect-error Every language must provide the shared accessibility key.
export const missingKey: LocaleContent = missingAccessibility;
// @ts-expect-error Theme labels must remain strings.
export const incompatible: LocaleContent = { ...ja, themeAuto: 42 };
// @ts-expect-error Language metadata must include both self-name labels.
export const incompleteLanguage: LocaleContent = { ...zhHant, language: { label: "中文" } };
const { toolCta, ...missingHomeAction } = en;
void toolCta;
// @ts-expect-error Every locale must include the complete Home action copy.
export const incompleteHome: LocaleContent = missingHomeAction;
// @ts-expect-error The registry must include every supported locale.
export const incompleteRegistry: Record<Locale, LocaleContent> = { en, ja };
// @ts-expect-error Unknown internal identities are rejected at the consumer boundary.
getContent("fr");
// @ts-expect-error Unknown identities cannot create language links.
localeHref("fr");
// @ts-expect-error Consumers cannot edit canonical copy through the registry.
locales.en.title = "Changed";
