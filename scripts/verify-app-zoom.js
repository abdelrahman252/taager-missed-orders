"use strict";

const path = require("path");
const { _electron: electron } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const USER_DATA_DIR = path.join(ROOT, ".codex-tmp", `qa-app-zoom-user-data-${process.pid}`);
const LEVELS = [75, 90, 100, 110, 125, 150];
let currentStep = "startup";
const watchdog = setTimeout(() => {
  console.error(`[verify-app-zoom] timed out during: ${currentStep}`);
  process.exit(1);
}, 90000);

async function launchApp() {
  const app = await electron.launch({
    cwd: ROOT,
    args: [ROOT],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TAAGER_QA_USER_DATA_DIR: USER_DATA_DIR,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
  await page.waitForFunction(() => window.api && typeof window.api.getAppZoom === "function", null, { timeout: 15000 });
  return { app, page };
}

async function closeApp(app) {
  await Promise.race([
    app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => app.close().catch(() => {})),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (app.process() && !app.process().killed) app.process().kill();
}

async function getZoom(page) {
  return page.evaluate(() => window.api.getAppZoom());
}

async function clickControl(page, selector) {
  await page.locator(selector).evaluate((control) => control.click());
}

async function assertZoom(page, expected, label) {
  await page.waitForFunction((value) => document.getElementById("btn-zoom-reset")?.textContent === value + "%", expected);
  const actual = await getZoom(page);
  if (actual !== expected) throw new Error(`${label}: expected ${expected}%, got ${actual}%`);
}

(async () => {
  currentStep = "first launch";
  let first = await launchApp();
  try {
    const { page } = first;
    currentStep = "titlebar controls";
    await clickControl(page, "#btn-zoom-reset");
    await assertZoom(page, 100, "reset");

    for (const expected of LEVELS.slice(LEVELS.indexOf(100) + 1)) {
      await clickControl(page, "#btn-zoom-in");
      await assertZoom(page, expected, "increase");
    }
    await page.evaluate(() => window.api.increaseAppZoom());
    await assertZoom(page, 150, "maximum clamp");

    const titlebar = await page.evaluate(() => {
      const bar = document.getElementById("main-titlebar");
      const zoom = document.querySelector(".tb-zoom-control");
      const controls = document.querySelector(".titlebar-controls");
      return {
        overflow: Math.ceil(bar.scrollWidth - bar.clientWidth),
        zoomVisible: !!zoom && zoom.getBoundingClientRect().width > 0,
        controlsVisible: !!controls && controls.getBoundingClientRect().width > 0,
      };
    });
    if (titlebar.overflow > 2 || !titlebar.zoomVisible || !titlebar.controlsVisible) {
      throw new Error("150% titlebar controls are clipped: " + JSON.stringify(titlebar));
    }

    currentStep = "keyboard shortcuts";
    await page.keyboard.press("Control+0");
    await assertZoom(page, 100, "keyboard reset");
    await page.keyboard.press("Control++");
    await assertZoom(page, 110, "keyboard increase");
    await page.keyboard.press("Control+-");
    await assertZoom(page, 100, "keyboard decrease");

    currentStep = "mouse wheel";
    await page.evaluate(() => {
      document.dispatchEvent(new WheelEvent("wheel", {
        deltaY: -120,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    await assertZoom(page, 110, "mouse-wheel increase");

    currentStep = "minimum clamp";
    await page.evaluate(() => window.api.decreaseAppZoom());
    await page.evaluate(() => window.api.decreaseAppZoom());
    await page.evaluate(() => window.api.decreaseAppZoom());
    await assertZoom(page, 75, "saved minimum");
    console.log("[verify-app-zoom] controls, shortcuts, wheel, and limits verified");
  } finally {
    currentStep = "first shutdown";
    await closeApp(first.app);
  }

  console.log("[verify-app-zoom] verifying restart persistence");
  currentStep = "second launch";
  const second = await launchApp();
  try {
    currentStep = "restart persistence";
    await assertZoom(second.page, 75, "restart persistence");
    await second.page.evaluate(() => window.api.resetAppZoom());
    await assertZoom(second.page, 100, "cleanup reset");
  } finally {
    currentStep = "second shutdown";
    await closeApp(second.app);
  }

  clearTimeout(watchdog);
  console.log("[verify-app-zoom] presets, controls, shortcuts, wheel, limits, and persistence verified");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
