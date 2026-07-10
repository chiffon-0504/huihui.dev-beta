import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "../../workers/huihui-api/worker.js";

const fallbackLinks = [
  "https://openai.com/news",
  "https://developer.apple.com/news/",
  "https://android-developers.googleblog.com/",
];

function rssFeed({ title, link, cdataTitle = false }) {
  const titleElement = cdataTitle
    ? `<title><![CDATA[${title}]]></title>`
    : `<title>${title}</title>`;

  return `
    <rss>
      <channel>
        <item>
          ${titleElement}
          <link>${link}</link>
          <pubDate>Thu, 09 Jul 2026 12:00:00 GMT</pubDate>
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
  vi.unstubAllGlobals();
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
