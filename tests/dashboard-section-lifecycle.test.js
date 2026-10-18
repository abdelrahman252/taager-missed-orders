"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "src", "renderer", "pages", "dashboard");
const loaderPath = path.join(root, "sections", "section3-orders.js");
const loaderSource = fs.readFileSync(loaderPath, "utf8");

function createOrdersPane() {
  const pane = {
    dataset: {},
    hidden: false,
    isConnected: true,
    innerHTML: "",
  };
  const shell = { _dashboardActiveSection: "orders", _dashboardActivePane: pane };
  let resolveScripts;
  let hydrationCalls = 0;
  const window = {
    ensureFeatureScripts: () => new Promise((resolve) => { resolveScripts = resolve; }),
  };
  const context = {
    window,
    document: { getElementById: () => shell },
    Promise,
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(loaderSource, context, { filename: loaderPath });
  return {
    pane,
    window,
    render(data, ctx) { return window.renderSection3(pane, data, ctx); },
    hydrate(entry) {
      hydrationCalls += 1;
      window.renderSection3HydratedEntry = entry;
      resolveScripts();
    },
    hydrationCalls: () => hydrationCalls,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function testCleanupBeforeHydrationResolves() {
  const fixture = createOrdersPane();
  let hydrationInvoked = false;
  const cleanup = fixture.render({}, {});
  assert.strictEqual(typeof cleanup, "function");

  cleanup();
  cleanup();
  fixture.hydrate(() => { hydrationInvoked = true; });
  await flushPromises();

  assert.strictEqual(hydrationInvoked, false, "a cancelled pane must not hydrate after its scripts load");
  assert.strictEqual(fixture.pane._s3HydrationState, null);
}

async function testHydrationThenRepeatedShellCleanup() {
  const fixture = createOrdersPane();
  let destroyCalls = 0;
  const sectionDestroy = fixture.render({}, {});
  let cleanupRunning = false;
  let cleanupComplete = false;
  const shellCleanup = function () {
    if (cleanupRunning || cleanupComplete) return;
    cleanupRunning = true;
    try {
      sectionDestroy();
      destroyCalls += 1;
    } finally {
      cleanupRunning = false;
      cleanupComplete = true;
    }
  };
  // This is the shell-owned wrapper installed before the lazy renderer runs.
  fixture.pane._dashboardSectionCleanup = shellCleanup;
  fixture.hydrate(() => undefined);
  await flushPromises();

  assert.strictEqual(fixture.pane._s3HydrationState.cleanup, null,
    "the loader must not adopt the shell's own cleanup wrapper");
  shellCleanup();
  shellCleanup();
  assert.strictEqual(destroyCalls, 1, "shell cleanup must be idempotent across repeated teardown");
  assert.strictEqual(fixture.pane._s3HydrationState, null);
}

async function main() {
  await testCleanupBeforeHydrationResolves();
  await testHydrationThenRepeatedShellCleanup();

  const sectionsDir = path.join(root, "sections");
  const loaders = fs.readdirSync(sectionsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(sectionsDir, name));
  for (const file of loaders) {
    const source = fs.readFileSync(file, "utf8");
    assert(!/state\.cleanup = typeof cleanup === 'function' \? cleanup : mountEl\._dashboardSectionCleanup/.test(source),
      `${path.basename(file)} must not adopt a pre-existing shell cleanup wrapper`);
  }
  console.log("Dashboard section lifecycle regression checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
