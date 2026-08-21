const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export function isTurnstileFrameUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.origin === TURNSTILE_ORIGIN &&
      url.pathname.split("/").includes("turnstile")
    );
  } catch {
    return false;
  }
}
