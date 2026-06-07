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
  launchPersistentChromeContext,
};
