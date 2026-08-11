import { expect, test } from "@playwright/test";

async function openWorksLightbox(page, key = "Enter") {
  const response = await page.goto("/works/", { waitUntil: "load" });
  const trigger = page.locator(".showcase-photo-card img.zoomable").first();
  const lightbox = page.locator("#lightbox");
  const closeButton = page.locator("#lightboxClose");

  expect(response?.status()).toBe(200);
  await expect(trigger).toHaveAttribute("tabindex", "0");
  await expect(trigger).toHaveAttribute("role", "button");
  await trigger.focus();
  await page.keyboard.press(key);
  await expect(lightbox).toHaveAttribute("open", "");
  await expect(lightbox).toHaveClass(/\bshow\b/);
  await expect(closeButton).toBeFocused();
  expect(await lightbox.evaluate((dialog) => dialog.matches(":modal"))).toBe(
    true,
  );

  return { closeButton, lightbox, trigger };
}

test("Enter opens the lightbox and Escape closes it with focus restored", async ({
  page,
}) => {
  const { lightbox, trigger } = await openWorksLightbox(page, "Enter");

  await page.keyboard.press("Escape");

  await expect(lightbox).not.toHaveAttribute("open", "");
  await expect(lightbox).not.toHaveClass(/\bshow\b/);
  await expect(trigger).toBeFocused();
});

test("Space opens the lightbox and the close button closes it", async ({
  page,
}) => {
  const { closeButton, lightbox, trigger } = await openWorksLightbox(page, " ");

  await closeButton.click();

  await expect(lightbox).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
});

test("clicking the dialog backdrop closes the lightbox", async ({ page }) => {
  const { lightbox, trigger } = await openWorksLightbox(page);

  await lightbox.click({ position: { x: 10, y: 10 } });

  await expect(lightbox).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
});

test("dynamically rendered milestone images remain keyboard accessible", async ({
  page,
}) => {
  const response = await page.goto("/milestones/", { waitUntil: "load" });
  const trigger = page.locator("#postsList img.zoomable").first();
  const lightbox = page.locator("#lightbox");

  expect(response?.status()).toBe(200);
  await expect(trigger).toHaveAttribute("tabindex", "0");
  await expect(trigger).toHaveAttribute("role", "button");
  await expect(trigger).toHaveAttribute(
    "data-full-src",
    "/images/3013_p.webp",
  );
  await trigger.focus();
  await page.keyboard.press("Enter");

  await expect(lightbox).toHaveAttribute("open", "");
  await expect(page.locator("#lightboxImg")).toHaveAttribute(
    "src",
    /\/images\/3013_p\.webp$/,
  );

  await page.keyboard.press("Escape");
  await expect(lightbox).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
});
