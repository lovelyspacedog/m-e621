import { chromium } from "playwright";
import path from "node:path";

const BASE = "http://127.0.0.1:5173";
const OUT = path.resolve("screenshots/raw");

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

await page.goto(`${BASE}/#/posts?tags=rating%3Asafe+order%3Arandom`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3000);
await shot("02-posts-page");

try {
  const img = page.locator("main img, .v-main img").first();
  await img.waitFor({ timeout: 15000 });
  await img.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  await shot("03-post-details-or-fullscreen");
} catch (e) {
  console.log("post click failed:", e.message);
}

await browser.close();
console.log("done");
