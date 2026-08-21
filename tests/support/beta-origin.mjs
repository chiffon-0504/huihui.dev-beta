export const BETA_SITE_ORIGIN = "https://beta.huihui.dev";

export function assertFinalUrlOrigin(
  requestedUrl,
  finalUrl,
  expectedOrigin = BETA_SITE_ORIGIN,
) {
  const requested = new URL(requestedUrl, `${expectedOrigin}/`);
  let final;

  try {
    final = new URL(finalUrl);
  } catch (error) {
    throw new Error(
      `Requested ${requested.href} resolved to invalid final URL ${String(finalUrl)}; unexpected origin <invalid>; expected ${expectedOrigin}.`,
    );
  }

  if (final.origin !== expectedOrigin) {
    throw new Error(
      `Requested ${requested.href} resolved to ${final.href}; unexpected origin ${final.origin}; expected ${expectedOrigin}.`,
    );
  }

  return final;
}

export function assertBetaPageOrigin(requestedUrl, finalUrl) {
  return assertFinalUrlOrigin(requestedUrl, finalUrl, BETA_SITE_ORIGIN);
}

export function assertExactFinalUrl(requestedUrl, finalUrl) {
  const requested = new URL(requestedUrl);
  const final = assertFinalUrlOrigin(
    requested,
    finalUrl,
    requested.origin,
  );

  if (final.href !== requested.href) {
    throw new Error(
      `Requested ${requested.href} resolved to ${final.href}; expected canonical URL ${requested.href}.`,
    );
  }

  return final;
}
