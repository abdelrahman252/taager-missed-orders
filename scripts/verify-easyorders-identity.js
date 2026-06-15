"use strict";

const assert = require("assert");
const fs = require("fs");
const { chromium } = require("playwright-core");
const {
  createEasyOrdersExportFlow,
  parseEasyOrdersIdentityFromDocument,
} = require("../src/bot/easy-orders-export");

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

const multiStorePopover = `
  <div class="MuiPopover-paper">
    <div style="display:none">
      <p>Hidden Decoy Store</p>
      <span>hidden.decoy@example.test</span>
    </div>
    <div>
      <div>
        <p>  North   Star Outlet 🟢  </p>
        <span>OWNER.ALPHA@EXAMPLE.TEST</span>
      </div>
    </div>
    <div>
      <h6>Stores:</h6>
      <button><span>Blue Harbor Shop</span></button>
      <button><span>North Star Outlet</span></button>
      <button><span>Cedar Market</span></button>
      <button>Add Store</button>
    </div>
    <a href="#/update-seller-info"><p>update your info</p></a>
    <div>
      <h6>Change To:</h6>
      <button><p>Sample Account One</p><span>switch.one@example.test</span></button>
      <button><p>Sample Account Two</p><span>switch.two@example.test</span></button>
    </div>
    <button>Sign Out</button>
  </div>
`;

const singleStorePopover = `
  <div role="menu">
    <section>
      <span>single.owner@example.test</span>
      <p>Solo Sample Store ✅</p>
    </section>
    <button>Sign Out</button>
  </div>
`;

const mojibakeStatusPopover = `
  <div role="dialog">
    <div>
      <p>Encoded Sample \u00f0\u0178\u0178\u00a2</p>
      <span>encoded.owner@example.test</span>
    </div>
    <h6>Stores:</h6>
  </div>
`;

const availableStoresOnly = `
  <div class="MuiPopover-paper">
    <h6>Stores:</h6>
    <button><span>First Available Store</span></button>
    <button><span>Second Available Store</span></button>
    <h6>Change To:</h6>
    <button><p>Switchable Account</p><span>switch.only@example.test</span></button>
  </div>
`;

const storeSelection = `
  <div class="MuiGrid-root MuiGrid-container">
    <button class="MuiPaper-root MuiCard-root">
      <div class="MuiCardContent-root">
        <img alt="Blue Harbor Shop">
        <h6>Blue Harbor Shop</h6>
        <p>blue-harbor.example</p>
      </div>
    </button>
    <button class="MuiPaper-root MuiCard-root">
      <div class="MuiCardContent-root">
        <img alt="North Star Outlet">
        <h6>North Star Outlet</h6>
        <p>north-star.example</p>
      </div>
    </button>
  </div>
`;

async function parseFixture(page, html) {
  await page.setContent(html);
  return page.evaluate(parseEasyOrdersIdentityFromDocument);
}

function simulatedEasyOrdersApp(scenario) {
  const data = JSON.stringify({
    email: scenario.email,
    initialStore: scenario.initialStore,
    headerReadable: scenario.headerReadable !== false,
    selectionDoesNotChange: scenario.selectionDoesNotChange === true,
    rootStartsAtSelection: scenario.rootStartsAtSelection === true,
  });
  return `
    <!doctype html>
    <html lang="en">
      <body>
        <script>
          const scenario = ${data};

          function dashboardMarkup() {
            const selectedStore = localStorage.getItem("activeStore");
            const store = selectedStore || scenario.initialStore;
            const readable = scenario.headerReadable || !!selectedStore;
            return \`
              <header class="MuiAppBar-root">
                <button aria-label="app_bar.user_settings" onclick="toggleIdentityMenu()">
                  <span class="MuiAvatar-root">U</span>
                </button>
                <button aria-label="language-switcher"><p>en</p></button>
                <button role="menuitem" aria-label="english" onclick="selectEnglish()">English</button>
              </header>
              <main class="OrderList">Orders</main>
              <div id="identity-menu" role="menu" style="display:none">
                \${readable ? \`<div><p>\${store} 🟢</p><span>\${scenario.email}</span></div>\` : ""}
                <h6>Stores:</h6>
                <button><span>Blue Harbor Shop</span></button>
                <button><span>North Star Outlet</span></button>
                <h6>Change To:</h6>
                <button><p>Switchable Sample</p><span>switchable@example.test</span></button>
              </div>
            \`;
          }

          function selectionMarkup() {
            return \`
              <div class="MuiGrid-root">
                <button class="MuiCard-root" onclick="activateStore('Blue Harbor Shop')">
                  <h6>Blue Harbor Shop</h6><p>blue-harbor.example</p>
                </button>
                <button class="MuiCard-root" onclick="activateStore('North Star Outlet')">
                  <h6>North Star Outlet</h6><p>north-star.example</p>
                </button>
              </div>
            \`;
          }

          function toggleIdentityMenu() {
            const menu = document.getElementById("identity-menu");
            if (menu) menu.style.display = menu.style.display === "none" ? "block" : "none";
          }

          function selectEnglish() {
            document.documentElement.lang = "en";
            const label = document.querySelector('[aria-label="language-switcher"] p');
            if (label) label.textContent = "en";
          }

          function activateStore(store) {
            if (!scenario.selectionDoesNotChange) localStorage.setItem("activeStore", store);
            location.hash = "#/orders";
            render();
          }

          function render() {
            document.body.innerHTML = location.hash === "#/store-selection"
              ? selectionMarkup()
              : dashboardMarkup();
          }

          addEventListener("hashchange", render);
          addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            const menu = document.getElementById("identity-menu");
            if (menu) menu.style.display = "none";
          });
          if (scenario.rootStartsAtSelection && !location.hash) {
            history.replaceState(null, "", "#/store-selection");
          }
          render();
        </script>
      </body>
    </html>
  `;
}

async function runFlowScenario(browser, scenario) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("https://app.easy-orders.net/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: simulatedEasyOrdersApp(scenario),
    })
  );
  const events = [];
  const flow = createEasyOrdersExportFlow({
    config: {
      easyEmail: "owner.alpha@example.test",
      easyPassword: "sample-password",
      easyStore: "North Star Outlet",
    },
    emit: (event) => events.push(event),
  });
  return { context, page, flow, events };
}

(async () => {
  const executablePath = findChrome();
  assert(executablePath, "Google Chrome or Chromium is required for this verification");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();

    const multiStoreIdentity = await parseFixture(page, multiStorePopover);
    assert.deepStrictEqual(
      multiStoreIdentity,
      {
        email: "owner.alpha@example.test",
        store: "north star outlet",
        source: "account-popover-header",
      },
      "multi-store popup uses the active header and ignores store and account navigation"
    );
    assert.equal(
      multiStoreIdentity.store,
      "north star outlet",
      "regression: Store A in the active header wins over Store B listed first under Stores"
    );

    assert.deepStrictEqual(
      await parseFixture(page, singleStorePopover),
      {
        email: "single.owner@example.test",
        store: "solo sample store",
        source: "account-popover-header",
      },
      "single-store popup supports the adjacent label after the email"
    );

    assert.deepStrictEqual(
      await parseFixture(page, mojibakeStatusPopover),
      {
        email: "encoded.owner@example.test",
        store: "encoded sample",
        source: "account-popover-header",
      },
      "encoded status markers do not become part of the store identity"
    );

    assert.equal(
      await parseFixture(page, availableStoresOnly),
      null,
      "available stores and switchable accounts are not accepted without an active header"
    );

    await page.setContent(storeSelection);
    const cards = page.locator(".MuiCard-root");
    const cardNames = [];
    for (let i = 0; i < await cards.count(); i++) {
      cardNames.push((await cards.nth(i).locator("h6").first().innerText()).trim().toLowerCase());
    }
    assert.deepStrictEqual(
      cardNames,
      ["blue harbor shop", "north star outlet"],
      "store-selection reads store names from h6 titles"
    );
    assert.equal(cardNames.includes("north star outlet"), true, "configured store matches its title");
    assert.equal(cardNames.includes("north-star.example"), false, "domain text is not treated as a store title");

    {
      const scenario = await runFlowScenario(browser, {
        email: "owner.alpha@example.test",
        initialStore: "Blue Harbor Shop",
        rootStartsAtSelection: true,
      });
      try {
        await scenario.flow.login(scenario.page);
        assert.equal(
          await scenario.page.evaluate(() => localStorage.getItem("activeStore")),
          "North Star Outlet",
          "first-login store selection chooses the configured card title"
        );
        assert(
          !scenario.page.url().includes("store-selection"),
          "first-login selection stays on the selected store instead of reopening store selection"
        );
      } finally {
        await scenario.context.close();
      }
    }

    {
      const scenario = await runFlowScenario(browser, {
        email: "owner.alpha@example.test",
        initialStore: "Blue Harbor Shop",
      });
      try {
        await scenario.flow.login(scenario.page);
        assert.equal(
          await scenario.page.evaluate(() => localStorage.getItem("activeStore")),
          "North Star Outlet",
          "normal login corrects a readable but wrong active store"
        );
        assert(
          scenario.events.some((event) => event.event === "identity-verified" && event.where === "login"),
          "normal login emits identity verification only after recovery"
        );
      } finally {
        await scenario.context.close();
      }
    }

    {
      const scenario = await runFlowScenario(browser, {
        email: "owner.alpha@example.test",
        initialStore: "Unknown Header",
        headerReadable: false,
      });
      try {
        await scenario.flow.login(scenario.page);
        assert.equal(
          await scenario.page.evaluate(() => localStorage.getItem("activeStore")),
          "North Star Outlet",
          "an unreadable active header recovers through explicit store selection"
        );
      } finally {
        await scenario.context.close();
      }
    }

    {
      const scenario = await runFlowScenario(browser, {
        email: "different.owner@example.test",
        initialStore: "North Star Outlet",
      });
      try {
        await assert.rejects(
          scenario.flow.login(scenario.page),
          /EASY_ORDERS_IDENTITY_MISMATCH/,
          "a different active account fails instead of selecting within the wrong account"
        );
      } finally {
        await scenario.context.close();
      }
    }

    {
      const scenario = await runFlowScenario(browser, {
        email: "owner.alpha@example.test",
        initialStore: "Blue Harbor Shop",
        selectionDoesNotChange: true,
      });
      try {
        await assert.rejects(
          scenario.flow.login(scenario.page),
          /EASY_ORDERS_STORE_MISMATCH/,
          "verification fails when explicit selection does not change the active header"
        );
      } finally {
        await scenario.context.close();
      }
    }

    const source = fs.readFileSync(require.resolve("../src/bot/easy-orders-export"), "utf8");
    const runnerSource = fs.readFileSync(require.resolve("../src/bot/runner"), "utf8");
    const dashboardSource = fs.readFileSync(require.resolve("../src/bot/dashboard-fetch"), "utf8");
    assert(!source.includes("texts.slice(storesIndex + 1)"), "available-store list fallback was removed");
    assert(
      source.includes("activeIdentity = await readActiveIdentity(page)") &&
      source.includes("currentStore = await readCurrentStore(page, activeIdentity)"),
      "explicit selection is followed by active-header verification"
    );
    assert(
      runnerSource.includes("return easyOrdersFlow.login(page);") &&
      runnerSource.includes("easyOrdersFlow.exportReport(page, exportFromDate, \"orders\")") &&
      runnerSource.includes("easyOrdersFlow.exportReport(page, exportFromDate, \"missed-orders\")") &&
      runnerSource.includes("return easyOrdersFlow.assertSession(page);"),
      "normal runner login, exports, and session guards use the shared EasyOrders flow"
    );
    assert(
      dashboardSource.includes("await easyOrdersFlow.login(page);") &&
      dashboardSource.includes("easyOrdersFlow.exportOrders(page, easyFrom);"),
      "dashboard update uses the same shared EasyOrders login and identity verification"
    );

    console.log("EasyOrders identity verification passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
