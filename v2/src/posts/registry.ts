import { localeHref, type Locale } from "../locales";

export const postCategories = ["music", "rhythm-games", "journal"] as const;
export type PostCategory = (typeof postCategories)[number];

export interface PostMetadata {
  readonly id: string;
  readonly category: PostCategory;
  readonly published?: string;
}

// Structural ownership only. Display copy belongs to LocaleContent.postsPage.
// Dates and stable IDs come from the existing short posts in js/posts-data.js.
export const posts = [
  { id: "ave-mujica-exitus-taipei-day2-2026-08-09", category: "music", published: "2026-08-09" },
  { id: "arcaea-course-mode-phase-10-clear-2026-07-31", category: "rhythm-games", published: "2026-07-31" },
  { id: "arcaea-boss-song-ex-scores-2026-06-28", category: "rhythm-games", published: "2026-06-28" },
  { id: "arcaea-potential-12-2026-06-27", category: "rhythm-games", published: "2026-06-27" },
  { id: "arcaea-potential-11-90-2026-05-03", category: "rhythm-games", published: "2026-05-03" },
  { id: "arcaea-cyaegha-ex-plus-2026-04-19", category: "rhythm-games", published: "2026-04-19" },
  { id: "hello-world-2026-04-14", category: "journal", published: "2026-04-14" },
] as const satisfies readonly PostMetadata[];

export type PostId = (typeof posts)[number]["id"];
export type Post = PostMetadata & { readonly id: PostId };

// These short entries are readable in full on Posts; no detail route is implied.
export function postHref(locale: Locale, id: PostId): string {
  return localeHref(locale, `#${id}`, "posts");
}
