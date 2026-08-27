import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "../../workers/huihui-api/worker.js";

const safeLinksAfterRejectedLatestItem = [
  "https://openai.com/news",
  "https://www.anthropic.com/news/older-article",
  "https://developer.apple.com/news/",
];
const anthropicNewsroomUrl = "https://www.anthropic.com/news";
const fixedNow = new Date("2026-07-31T12:00:00.000Z");

function rssFeed({
  title,
  link,
  cdataTitle = false,
  pubDate = "Thu, 09 Jul 2026 12:00:00 GMT",
}) {
  const titleElement = cdataTitle
    ? `<title><![CDATA[${title}]]></title>`
    : `<title>${title}</title>`;

  return `
    <rss>
      <channel>
        <item>
          ${titleElement}
          <link>${link}</link>
          <pubDate>${pubDate}</pubDate>
        </item>
      </channel>
    </rss>
  `;
}

function encodeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function anthropicNewsroom({
  title,
  link = "/news/deterministic-fixture",
  pubDate = "Thu, 09 Jul 2026 12:00:00 GMT",
}) {
  return `
    <main>
      <a href="/news/older-article">
        <time>Wed, 08 Jul 2026 12:00:00 GMT</time>
        <span>Announcements</span>
        <span>Older Anthropic article</span>
      </a>
      <a href="${link}">
        <time>${pubDate}</time>
        <span>Announcements</span>
        <span>${encodeHtml(title)}</span>
      </a>
    </main>
  `;
}

async function requestTechNews(options) {
  const pendingTasks = [];
  const rss = rssFeed(options);
  const newsroom = anthropicNewsroom(options);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      new Response(url === anthropicNewsroomUrl ? newsroom : rss, {
        status: 200,
        headers: {
          "Content-Type":
            url === anthropicNewsroomUrl
              ? "text/html"
              : "application/rss+xml",
        },
      }),
    ),
  );
  vi.stubGlobal("caches", {
    default: {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    },
  });

  const response = await worker.fetch(
    new Request("https://api.example.test/api/tech-news"),
    {},
    {
      waitUntil(task) {
        pendingTasks.push(task);
      },
    },
  );

  await Promise.all(pendingTasks);
  return response.json();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tech-news Worker timestamps", () => {
  test("clamps future RSS publication times to just now", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const data = await requestTechNews({
      title: "Future article",
      link: "/news/future",
      pubDate: "Fri, 31 Jul 2026 16:19:00 GMT",
    });

    expect(data.techNews.map((item) => item.timeAgo)).toEqual([
      "just now",
      "just now",
      "just now",
    ]);
    expect(JSON.stringify(data.techNews)).not.toContain("-");
  });

  test("formats an RSS publication time equal to now as just now", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const data = await requestTechNews({
      title: "Current article",
      link: "/news/current",
      pubDate: "Fri, 31 Jul 2026 12:00:00 GMT",
    });

    expect(data.techNews.map((item) => item.timeAgo)).toEqual([
      "just now",
      "just now",
      "just now",
    ]);
  });

  test("returns an empty timeAgo for an invalid RSS publication time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const data = await requestTechNews({
      title: "Invalid date article",
      link: "/news/invalid-date",
      pubDate: "not-a-date",
    });

    expect(data.techNews.map((item) => item.timeAgo)).toEqual([
      "",
      "23 days ago",
      "",
    ]);
    expect(JSON.stringify(data.techNews)).not.toContain("NaN");
  });

  test.each([
    ["minutes", "Fri, 31 Jul 2026 11:30:00 GMT", "30 mins ago"],
    ["hours", "Fri, 31 Jul 2026 06:00:00 GMT", "6 hours ago"],
    ["days", "Tue, 28 Jul 2026 12:00:00 GMT", "3 days ago"],
  ])("keeps the existing past-time %s format", async (_unit, pubDate, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const data = await requestTechNews({
      title: "Past article",
      link: "/news/past",
      pubDate,
    });

    expect(data.techNews.map((item) => item.timeAgo)).toEqual([
      expected,
      expected,
      expected,
    ]);
  });
});

describe("tech-news Worker sanitization", () => {
  test("uses exactly the official OpenAI, Anthropic, and Apple source contract", async () => {
    const data = await requestTechNews({
      title: "Official source fixture",
      link: "/news/official-source-fixture",
    });

    expect(data.techNews.map((item) => item.category)).toEqual([
      "OpenAI",
      "Anthropic",
      "Apple",
    ]);
    expect(data.techNews.map((item) => item.source)).toEqual([
      "OpenAI News",
      "Anthropic Newsroom",
      "Apple Developer News",
    ]);
    expect(data.techNews.map((item) => item.tag)).toEqual([
      "News",
      "Newsroom",
      "Developer",
    ]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://openai.com/news/rss.xml",
      "https://www.anthropic.com/news",
      "https://developer.apple.com/news/rss/news.rss",
    ]);
    expect(JSON.stringify(data.techNews)).not.toMatch(/Android|Google/);
  });

  test("keeps a hostile RSS title as plain response data", async () => {
    const hostileTitle = '</h3><img src=x onerror="alert(1)">';
    const data = await requestTechNews({
      title: hostileTitle,
      link: "/news/hostile-title",
      cdataTitle: true,
    });

    expect(data.ok).toBe(true);
    expect(data.techNews).toHaveLength(3);
    expect(data.techNews[0].title).toBe(hostileTitle);
    expect(Object.keys(data.techNews[0])).toEqual([
      "category",
      "title",
      "description",
      "tag",
      "source",
      "timeAgo",
      "link",
    ]);
  });

  test("keeps an encoded HTML title as plain response data", async () => {
    const data = await requestTechNews({
      title: "&lt;script&gt;alert(1)&lt;/script&gt;",
      link: "/news/encoded-title",
    });

    expect(data.techNews.map((item) => item.title)).toEqual([
      "<script>alert(1)</script>",
      "<script>alert(1)</script>",
      "<script>alert(1)</script>",
    ]);
  });

  test.each([
    ["a javascript URL", "javascript:alert(1)"],
    ["a malformed URL", "://not a valid URL"],
    ["an HTTP URL", "http://example.test/article"],
  ])("rejects %s and retains safe HTTPS source links", async (_label, link) => {
    const data = await requestTechNews({ title: "Safe title", link });

    expect(data.techNews.map((item) => item.link)).toEqual(
      safeLinksAfterRejectedLatestItem,
    );
  });

  test("keeps a valid HTTPS article URL and removes its fragment", async () => {
    const data = await requestTechNews({
      title: "Safe title",
      link: "https://example.test/article?id=1&amp;kind=security#details",
    });

    expect(data.techNews.map((item) => item.link)).toEqual([
      "https://example.test/article?id=1&kind=security",
      "https://www.anthropic.com/news/older-article",
      "https://example.test/article?id=1&kind=security",
    ]);
  });
});
