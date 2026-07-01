"use strict";

const SAFE_STARTUP_ARGS = Object.freeze([
  "--no-first-run",
  "--no-default-browser-check",
]);

const MAXIMUM_SPEED_ARGS = Object.freeze([
  "--disable-background-networking",
  "--disable-client-side-phishing-detection",
  "--disable-component-update",
  "--disable-domain-reliability",
  "--disable-breakpad",
  "--disable-crash-reporter",
  "--disable-default-apps",
  "--disable-hang-monitor",
  "--disable-popup-blocking",
  "--disable-prompt-on-repost",
  "--disable-sync",
  "--disable-translate",
  "--disable-notifications",
  "--disable-component-extensions-with-background-pages",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-v8-idle-tasks",
  "--disable-features=MediaRouter,OptimizationHints,OptimizationHintsFetching,AutofillServerCommunication,TabHoverCards,TabHoverCardImages,CalculateNativeWinOcclusion,GlobalMediaControls,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater,PrivacySandboxSettings4",
  "--hide-crash-restore-bubble",
  "--disk-cache-size=52428800",
  "--no-pings",
]);

const LOCALE_ARGS = Object.freeze([
  "--lang=ar-SA",
  "--accept-lang=ar-SA,ar,en",
]);

function buildMaximumSpeedChromeArgs(options = {}) {
  const windowSize = options.windowSize || "1280,800";
  return [
    ...SAFE_STARTUP_ARGS,
    ...MAXIMUM_SPEED_ARGS,
    "--force-device-scale-factor=1",
    `--window-size=${windowSize}`,
    ...LOCALE_ARGS,
  ];
}

function buildPersistentContextOptions(options = {}) {
  const launchOptions = {
    executablePath: options.executablePath,
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"],
    chromiumSandbox: true,
    args: buildMaximumSpeedChromeArgs({ windowSize: options.windowSize }),
    locale: "ar-SA",
    waitForInitialPage: false,
  };

  if (Object.prototype.hasOwnProperty.call(options, "viewport")) {
    launchOptions.viewport = options.viewport;
  }

  return launchOptions;
}

async function launchPersistentChromeContext(chromium, profilePath, options = {}) {
  return chromium.launchPersistentContext(
    profilePath,
    buildPersistentContextOptions(options)
  );
}

function isUsablePage(page) {
  return !!page && !(typeof page.isClosed === "function" && page.isClosed());
}

function isBlankAutomationUrl(url) {
  const value = String(url || "").trim().toLowerCase();
  return !value || value === "about:blank" || value === "chrome://new-tab-page/" || value === "chrome://newtab/";
}

function isInternalChromeUrl(url) {
  return /^chrome:|^devtools:|^edge:|^browser:/i.test(String(url || ""));
}

function scoreReusablePage(page, index) {
  const url = page.url();
  if (isBlankAutomationUrl(url)) return 1000 + index;
  if (isInternalChromeUrl(url)) return 500 + index;
  return index;
}

async function closeExtraBlankPages(context, keepPage, options = {}) {
  const log = typeof options.log === "function" ? options.log : null;
  const pages = context.pages().filter(isUsablePage);
  const hasNonBlankPage = pages.some((page) => page !== keepPage && !isBlankAutomationUrl(page.url())) ||
    (keepPage && !isBlankAutomationUrl(keepPage.url()));
  if (!hasNonBlankPage) return;

  for (const page of pages) {
    if (page === keepPage || !isBlankAutomationUrl(page.url())) continue;
    await page.close({ runBeforeUnload: false }).then(() => {
      if (log) log("[Chrome] closed extra blank tab");
    }).catch(() => {});
  }
}

async function getOrCreateAutomationPage(context, options = {}) {
  const log = typeof options.log === "function" ? options.log : null;
  const pages = context.pages().filter(isUsablePage);
  if (pages.length === 0) return context.newPage();

  const rankedPages = pages
    .map((page, index) => ({ page, score: scoreReusablePage(page, index) }))
    .sort((a, b) => a.score - b.score);
  const page = rankedPages[0].page;
  await closeExtraBlankPages(context, page, { log });
  return page;
}

function installUnexpectedBlankPageGuard(context, options = {}) {
  const log = typeof options.log === "function" ? options.log : null;
  const delayMs = Math.max(1000, Number(options.delayMs || 5000));
  const getActivePage = typeof options.getActivePage === "function" ? options.getActivePage : () => null;

  context.on("page", (page) => {
    setTimeout(async () => {
      try {
        if (!isUsablePage(page)) return;
        const activePage = getActivePage();
        if (page === activePage) return;
        if (!isBlankAutomationUrl(page.url())) return;

        const hasOtherUsablePage = context.pages().some((candidate) =>
          candidate !== page && isUsablePage(candidate)
        );
        if (!hasOtherUsablePage) return;

        await page.close({ runBeforeUnload: false });
        if (log) log("[Chrome] closed unexpected about:blank tab");
      } catch (_) {}
    }, delayMs);
  });
}

async function addChromeFingerprintSpoofing(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    delete window.__playwright;
    delete window.__pw_manual;
    delete window.__PW_inspect;
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["ar-SA", "ar", "en"] });
  });
}

module.exports = {
  addChromeFingerprintSpoofing,
  buildMaximumSpeedChromeArgs,
  buildPersistentContextOptions,
  closeExtraBlankPages,
  getOrCreateAutomationPage,
  installUnexpectedBlankPageGuard,
  launchPersistentChromeContext,
};
