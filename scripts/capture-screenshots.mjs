import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "http://127.0.0.1:5173";
const OUT = path.resolve("screenshots/raw");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
page.setDefaultTimeout(20000);

const shot = async (name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", name);
};

const go = async (url) => {
  // App uses createWebHashHistory
  const hashUrl = url.startsWith("#") ? url : `/#${url.startsWith("/") ? url : `/${url}`}`;
  await page.goto(`${BASE}${hashUrl}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
};

await go("/");
await page.getByText("m-e621").first().waitFor({ timeout: 15000 });
await shot("01-landing-page");

await go("/posts?tags=rating%3Asafe+order%3Arandom");
await shot("02-posts-page");

try {
  const img = page.locator("main img, .v-main img").first();
  if (await img.count()) {
    await img.click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await shot("03-post-details-or-fullscreen");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
} catch (e) {
  console.log("post click skipped:", e.message);
}

await go("/settings");
await shot("04-settings-page");

await go("/starred");
await shot("05-starred-tags");

await go("/suggester");
await shot("06-suggester");

await go("/dash");
await shot("07-artist-dashboard");

await go("/pools");
await shot("08-pools");

await go("/posts?tags=rating%3Asafe");
try {
  const burger = page.locator("button .mdi-menu").first();
  if (await burger.count()) {
    await burger.click({ timeout: 3000 });
    await page.waitForTimeout(700);
  }
} catch (e) {
  console.log("nav skipped:", e.message);
}
await shot("09-nav-site-modes");

await browser.close();
console.log("done");
