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
