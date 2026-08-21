import { describe, expect, test } from "vitest";
import { isTurnstileFrameUrl } from "../support/turnstile-frame.mjs";

describe("Turnstile rendered-frame URL contract", () => {
  test("accepts a Cloudflare Turnstile challenge frame", () => {
    expect(
      isTurnstileFrameUrl(
        "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/f/av0/widget",
      ),
    ).toBe(true);
  });

  test.each([
    ["empty", ""],
    ["blank frame", "about:blank"],
    ["wrong Cloudflare path", "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/widget"],
    ["lookalike origin", "https://challenges.cloudflare.com.example.test/turnstile/widget"],
  ])("rejects a %s URL", (_label, url) => {
    expect(isTurnstileFrameUrl(url)).toBe(false);
  });
});
