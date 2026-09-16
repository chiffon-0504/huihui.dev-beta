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

const { interestsTitle, ...missingAboutHeading } = en.aboutPage;
void interestsTitle;
// @ts-expect-error Every language must include all About copy.
export const incompleteAbout: LocaleContent = { ...en, aboutPage: missingAboutHeading };
// @ts-expect-error Shared footer contact labels must be translated.
export const incompleteContact: LocaleContent = { ...ja, contact: { email: "contact@huihui.dev" } };

const { alt, ...missingWorkAlt } = en.worksPage.website;
void alt;
// @ts-expect-error Every locale must provide meaningful image text.
export const incompleteWorks: LocaleContent = { ...en, worksPage: { ...en.worksPage, website: missingWorkAlt } };

import type { Post, PostCategory } from "../../v2/src/posts/registry";
import { postHref } from "../../v2/src/posts/registry";
import type { PostContent, PostsContent } from "../../v2/src/locales/types";

export const undatedPost: Post = { id: "hello-world-2026-04-14", category: "journal" };
// @ts-expect-error Arbitrary categories are not structural identities.
export const invalidCategory: PostCategory = "technology";
// @ts-expect-error Every category needs a translated label in each locale.
export const missingCategory: PostsContent = { ...en.postsPage, categories: { music: "Music", journal: "Journal" } };
// @ts-expect-error Every canonical post needs localized content.
export const missingArticle: PostsContent = { ...ja.postsPage, articles: {} };
// @ts-expect-error Excerpts are required even for short posts.
export const missingExcerpt: PostContent = { title: "Hello" };
// @ts-expect-error Article titles must be strings.
export const invalidTitle: PostContent = { title: 1, excerpt: "Hello" };
// @ts-expect-error Destinations must identify a canonical post.
postHref("en", "missing-post");
