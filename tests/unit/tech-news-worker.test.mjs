import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "../../workers/huihui-api/worker.js";

const fallbackLinks = [
  "https://openai.com/news",
  "https://developer.apple.com/news/",
  "https://android-developers.googleblog.com/",
];
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

async function requestTechNews(rss) {
  const pendingTasks = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(rss, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
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

    const data = await requestTechNews(
      rssFeed({
        title: "Future article",
        link: "https://example.test/future",
        pubDate: "Fri, 31 Jul 2026 16:19:00 GMT",
      }),
    );

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

    const data = await requestTechNews(
      rssFeed({
        title: "Current article",
        link: "https://example.test/current",
        pubDate: "Fri, 31 Jul 2026 12:00:00 GMT",
      }),
    );

    expect(data.techNews.map((item) => item.timeAgo)).toEqual([
      "just now",
      "just now",
      "just now",
    ]);
  });

  test("returns an empty timeAgo for an invalid RSS publication time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const data = await requestTechNews(
      rssFeed({
        title: "Invalid date article",
        link: "https://example.test/invalid-date",
        pubDate: "not-a-date",
      }),
    );

    expect(data.techNews.map((item) => item.timeAgo)).toEqual(["", "", ""]);
    expect(JSON.stringify(data.techNews)).not.toContain("NaN");
  });

  test.each([
    ["minutes", "Fri, 31 Jul 2026 11:30:00 GMT", "30 mins ago"],
    ["hours", "Fri, 31 Jul 2026 06:00:00 GMT", "6 hours ago"],
    ["days", "Tue, 28 Jul 2026 12:00:00 GMT", "3 days ago"],
  ])("keeps the existing past-time %s format", async (_unit, pubDate, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const data = await requestTechNews(
      rssFeed({
        title: "Past article",
        link: "https://example.test/past",
        pubDate,
      }),
    );

    expect(data.techNews.map((item) => item.timeAgo)).toEqual([
      expected,
      expected,
      expected,
    ]);
  });
});

describe("tech-news Worker sanitization", () => {
  test("keeps a hostile RSS title as plain response data", async () => {
    const hostileTitle = '</h3><img src=x onerror="alert(1)">';
    const data = await requestTechNews(
      rssFeed({
        title: hostileTitle,
        link: "https://example.test/article",
        cdataTitle: true,
      }),
    );

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
    const data = await requestTechNews(
      rssFeed({
        title: "&lt;script&gt;alert(1)&lt;/script&gt;",
        link: "https://example.test/article",
      }),
    );

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
  ])("replaces %s with source HTTPS fallbacks", async (_label, link) => {
    const data = await requestTechNews(
      rssFeed({ title: "Safe title", link }),
    );

    expect(data.techNews.map((item) => item.link)).toEqual(fallbackLinks);
  });

  test("keeps a valid HTTPS article URL and removes its fragment", async () => {
    const data = await requestTechNews(
      rssFeed({
        title: "Safe title",
        link: "https://example.test/article?id=1&amp;kind=security#details",
      }),
    );

    expect(data.techNews.map((item) => item.link)).toEqual([
      "https://example.test/article?id=1&kind=security",
      "https://example.test/article?id=1&kind=security",
      "https://example.test/article?id=1&kind=security",
    ]);
  });
});
