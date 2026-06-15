"use strict";

const assert = require("assert");
const fs = require("fs");
const { chromium } = require("playwright-core");
const { createEasyOrdersExportFlow } = require("../src/bot/easy-orders-export");

function findChrome() {
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`,
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

(async () => {
  const executablePath = findChrome();
  assert(executablePath, "Google Chrome or Chromium is required for this verification");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <button aria-label="language-switcher"><p>ar</p></button>
      <div role="menuitem" aria-label="english">English</div>
      <script>
        window.englishClicks = 0;
        document.querySelector('[role="menuitem"]').onclick = () => {
          window.englishClicks += 1;
          document.querySelector('[aria-label="language-switcher"] p').textContent = "en";
          document.documentElement.lang = "en";
          document.documentElement.dir = "ltr";
        };
      </script>
    `);

    const flow = createEasyOrdersExportFlow();
    assert.equal(await flow.ensureEnglish(page), true, "Arabic page switches to English");
    assert.equal(
      await page.locator('[aria-label="language-switcher"] p').innerText(),
      "en",
      "English is verified after the switch"
    );
    assert.equal(await flow.ensureEnglish(page, { force: true }), true, "forced fallback re-selects English");
    assert.equal(await page.evaluate(() => window.englishClicks), 2, "English menu item was selected twice");

    console.log("EasyOrders English guard verification passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
