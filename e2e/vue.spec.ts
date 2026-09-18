import { test, expect } from "@playwright/test";

/** Hash-router smoke — not a full e2e suite. Prefer `npm run test:unit` as the merge gate. */
test("landing hash route loads app shell", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.locator("#app")).toBeVisible();
});

test("posts hash route loads", async ({ page }) => {
  await page.goto("/#/posts");
  await expect(page.locator("#app")).toBeVisible();
});

test("mobile posts shows nav and search history", async ({ page }, testInfo) => {
  const mobileish = /Mobile|iPad|iPhone|Pixel/i.test(testInfo.project.name);
  test.skip(!mobileish, "mobile viewport projects only");

  await page.goto("/#/posts");
  await expect(page.locator("#app")).toBeVisible();
  // Temporary drawer hamburger (md / mobile breakpoint).
  await expect(page.locator(".v-app-bar button").first()).toBeVisible();
  // Search history stays available on narrow toolbars (M7).
  await expect(page.getByTitle("Search history")).toBeVisible();
});
