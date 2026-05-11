/**
 * Smoke verification for the Part Matcher UI (Playwright).
 * Run from project root: node verify.js
 *
 * Requires: npm install playwright && npx playwright install chromium
 */
const { chromium } = require("playwright");
const path = require("path");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const target = `file://${path.join(__dirname, "index.html")}`;

  await page.goto(target);
  await page.waitForSelector("#match-form");

  await page.fill("#query-input", "1/4-20 x 3/4 hex cap screw zinc");
  await page.click("#match-button");

  await page.waitForSelector("#results-list:not(.hidden)");
  const cards = await page.locator("#results-list .result-card").count();
  if (cards < 1) {
    throw new Error(`Expected result cards, got ${cards}`);
  }

  const title = await page.locator(".site-title").first().textContent();
  const logo = await page.locator(".brand-logo");
  await logo.waitFor({ state: "visible" });

  await page.screenshot({
    path: path.join(__dirname, "verification.png"),
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        headline: title.trim().replace(/\s+/g, " "),
        resultCards: cards,
        screenshot: path.join(__dirname, "verification.png"),
      },
      null,
      2
    )
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
