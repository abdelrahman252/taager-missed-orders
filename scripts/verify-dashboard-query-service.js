"use strict";

const assert = require("assert");
const { createDashboardQueryService } = require("../src/main/dashboard-query-service");

const accounts = {
  a1: { snapshot: [], marketing: { tiktok: { summary: { campaignBreakdown: [] } } } },
  a2: { snapshot: [], marketing: { facebook: { summary: { campaignBreakdown: [] } } } },
};

for (let i = 0; i < 15000; i++) {
  const accountId = Math.floor(i / 40) % 2 ? "a1" : "a2";
  const sku = "SKU-" + (i % 40);
  accounts[accountId].snapshot.push({
    taagerOrderNumber: "ORDER-" + i,
    createdAt: "2026-05-" + String((i % 28) + 1).padStart(2, "0"),
    orderStatusBucket: i % 4 === 0 ? "delivered" : "confirmed",
    products: "Product " + (i % 40),
    sku,
    city: "City " + (i % 20),
    qty: 1,
    dashboardTotalPrice: 100,
    profitAfterTax: 20,
  });
}

accounts.a1.marketing.tiktok.summary.campaignBreakdown.push({
  campaign: "Scale SKU-1 now",
  spend: 500,
  currency: "USD",
  clicks: 100,
  impressions: 1000,
  landingPageViews: 0,
  total_landing_page_view: 200,
});
accounts.a2.marketing.facebook.summary.campaignBreakdown.push({
  campaign: "Unknown campaign",
  spend: 100,
  clicks: 10,
  impressions: 100,
});

let revision = 1;
const service = createDashboardQueryService({
  getAccounts: () => accounts,
  getAllowedAccountIds: () => ["a1", "a2"],
  getRevision: () => revision,
});

const startedAt = Date.now();
const orders = service.query({
  kind: "orders",
  accountIds: ["a1", "a2"],
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  page: 2,
  pageSize: 25,
});
assert.equal(orders.ok, true);
assert.equal(orders.pagination.total, 15000);
assert.equal(orders.rows.length, 25);
assert.equal(orders.summary.rawOrders, 15000);
assert.equal(orders.summary.delivered, 3750);

const productsStartedAt = Date.now();
const products = service.query({
  kind: "products",
  accountIds: ["a1", "a2"],
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  page: 1,
  pageSize: 10,
});
assert.equal(products.ok, true);
assert.equal(products.pagination.total, 40);
assert.equal(products.rows.length, 10);
assert.equal(products.summary.totalOrders, 15000);
assert.ok(products.rows.some((row) => row.accountCount === 2));
assert.ok(products.rows.every((row) => Number.isFinite(row.ndrPct) && Number.isFinite(row.profitLoss)));
assert.ok(Date.now() - productsStartedAt < 300, "Initial Products page query should complete within 300ms");

const deliveredProducts = service.query({
  kind: "products",
  accountIds: ["a1", "a2"],
  filters: { statusKey: "delivered" },
  sortBy: "commission",
  sortDir: "desc",
  page: 1,
  pageSize: 10,
});
assert.equal(deliveredProducts.ok, true);
assert.equal(deliveredProducts.rows.length, 10);
assert.ok(deliveredProducts.rows.every((row) => row.deliveredCount > 0));

const campaigns = service.query({
  kind: "campaigns",
  accountIds: ["a1", "a2"],
  page: 1,
  pageSize: 25,
});
assert.equal(campaigns.ok, true);
assert.equal(campaigns.pagination.total, 2);
assert.ok(campaigns.rows.some((row) => row.attributionVerified && row.productSku === "SKU-1"));
assert.ok(campaigns.rows.some((row) => !row.attributionVerified));

const campaignOverviewStartedAt = Date.now();
const campaignOverview = service.query({
  kind: "campaign-overview",
  accountIds: ["a1", "a2"],
  reportingCurrency: "SAR",
  platform: "all",
  campaignPage: 1,
  productPage: 1,
  pageSize: 10,
});
assert.equal(campaignOverview.ok, true);
assert.equal(campaignOverview.campaignRows.length, 2);
assert.equal(campaignOverview.productRows.length, 1);
assert.equal(campaignOverview.campaignRows[0].rawCurrency, "USD");
assert.equal(campaignOverview.campaignRows[0].rawSpend, 500);
assert.equal(campaignOverview.campaignRows[0].spend, 1875);
assert.equal(campaignOverview.productRows[0].accountId, "a1", "Exact SKU attribution stays inside the campaign account");
assert.equal(campaignOverview.productRows[0].trafficViews, 200, "A positive platform fallback is used when the normalized landing-page field is zero");
assert.equal(campaignOverview.productRows[0].conversionRateAvailable, true, "Conversion rate is marked available only with a usable tracked-view denominator");
assert.equal(campaignOverview.objectives.length > 0, true);
assert.ok(Date.now() - campaignOverviewStartedAt < 300, "Initial Campaigns page query should complete within 300ms");

const multiProductCampaignService = createDashboardQueryService({
  getAccounts: () => ({
    multi: {
      snapshot: [
        { taagerOrderNumber: "MULTI-1", taagerCountry: "SA", sku: "SKU-A", products: "Product A", orderStatusBucket: "confirmed" },
        { taagerOrderNumber: "MULTI-1", taagerCountry: "SA", sku: "SKU-B", products: "Product B", orderStatusBucket: "confirmed" },
        { taagerOrderNumber: "NET-2", taagerCountry: "SA", sku: "SKU-A", products: "Product A", orderStatusBucket: "confirmed" },
        { taagerOrderNumber: "EXCLUDED-3", taagerCountry: "SA", sku: "SKU-A", products: "Product A", orderStatusBucket: "canceled_by_you" },
      ],
      marketing: {
        tiktok: {
          summary: {
            campaignBreakdown: [
              { campaign: "Scale SKU-A", spend: 100, currency: "SAR" },
              { campaign: "Scale SKU-B", spend: 100, currency: "SAR" },
            ],
          },
        },
      },
    },
  }),
  getAllowedAccountIds: () => ["multi"],
  getRevision: () => 1,
});
const multiProductCampaignOverview = multiProductCampaignService.query({
  kind: "campaign-overview",
  accountIds: ["multi"],
  reportingCurrency: "SAR",
  platform: "all",
  campaignPage: 1,
  productPage: 1,
  pageSize: 10,
});
assert.equal(multiProductCampaignOverview.totals.productOrderCount, 3, "Product totals may include one order under multiple SKUs");
assert.equal(multiProductCampaignOverview.totals.taagerOrders, 2, "Campaign KPI uses unique matched net orders");

const independentCampaignPage = service.query({
  kind: "campaign-rows",
  accountIds: ["a1", "a2"],
  reportingCurrency: "SAR",
  filters: { match: "unmatched" },
  page: 1,
  pageSize: 10,
});
assert.equal(independentCampaignPage.rows.length, 1);
assert.equal(independentCampaignPage.rows[0].attributionVerified, false);

const independentProductActions = service.query({
  kind: "campaign-product-actions",
  accountIds: ["a1", "a2"],
  reportingCurrency: "SAR",
  page: 1,
  pageSize: 10,
});
assert.equal(independentProductActions.rows.length, 1);

const campaignAi = service.query({
  kind: "campaign-ai-context",
  accountIds: ["a1", "a2"],
  reportingCurrency: "SAR",
});
assert.equal(campaignAi.ok, true);
assert.ok(campaignAi.productActions.length <= 20);
assert.ok(campaignAi.topSpendCampaigns.length <= 20);

const details = service.query({
  kind: "product-details",
  accountIds: ["a1", "a2"],
  productKeys: [products.rows[0].key, products.rows[1].key],
});
assert.equal(details.ok, true);
assert.ok(details.details[products.rows[0].key]);
assert.ok(details.details[products.rows[1].key]);
assert.ok(Array.isArray(details.details[products.rows[0].key].cityBreakdown));
assert.ok(Array.isArray(details.details[products.rows[0].key].quantityCityBreakdown));

const productOptions = service.query({
  kind: "product-options",
  accountIds: ["a1", "a2"],
});
assert.equal(productOptions.ok, true);
assert.equal(productOptions.rows.length, 40);

assert.ok(Date.now() - startedAt < 3000, "Synthetic 15k query verification should complete quickly");
const cachedStartedAt = Date.now();
service.query({
  kind: "orders",
  accountIds: ["a1", "a2"],
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  page: 2,
  pageSize: 25,
});
assert.ok(Date.now() - cachedStartedAt < 300, "Cached local page query should complete within 300ms");
const cachedProductsStartedAt = Date.now();
service.query({
  kind: "products",
  accountIds: ["a1", "a2"],
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  page: 1,
  pageSize: 10,
});
assert.ok(Date.now() - cachedProductsStartedAt < 300, "Cached Products page query should complete within 300ms");
const cachedCampaignsStartedAt = Date.now();
service.query({
  kind: "campaign-overview",
  accountIds: ["a1", "a2"],
  reportingCurrency: "SAR",
  platform: "all",
  campaignPage: 1,
  productPage: 1,
  pageSize: 10,
});
assert.ok(Date.now() - cachedCampaignsStartedAt < 300, "Cached Campaigns page query should complete within 300ms");

const parityService = createDashboardQueryService({
  getAccounts: () => ({
    one: { snapshot: [
      { taagerOrderNumber: "D-1", taagerCountry: "SA", sku: "SAME", products: "Same Product", orderStatusBucket: "delivered", qty: 1, dashboardTotalPrice: 100, profitAfterTax: 20, city: "Riyadh" },
      { taagerOrderNumber: "X-1", taagerCountry: "SA", sku: "SAME", products: "Same Product", orderStatusBucket: "canceled_by_you", qty: 5, dashboardTotalPrice: 500, profitAfterTax: 80, city: "Riyadh" },
    ] },
    two: { snapshot: [
      { taagerOrderNumber: "C-1", taagerCountry: "SA", sku: "SAME", products: "Same Product", orderStatusBucket: "confirmed", qty: 2, dashboardTotalPrice: 200, profitAfterTax: 40, city: "Jeddah" },
    ] },
  }),
  getAllowedAccountIds: () => ["one", "two"],
  getRevision: () => 1,
});
const parityProducts = parityService.query({ kind: "products", accountIds: ["one", "two"], page: 1, pageSize: 10 });
assert.equal(parityProducts.pagination.total, 1, "All Accounts combines matching country + SKU");
assert.equal(parityProducts.rows[0].totalOrders, 3, "Total orders includes canceled-by-you");
assert.equal(parityProducts.rows[0].totalOrderCount, 3, "Total order count includes canceled-by-you");
assert.equal(parityProducts.rows[0].placedCount, 2, "Product placed count is the net-order business count");
assert.equal(parityProducts.rows[0].netOrderCount, 2, "Net orders exclude canceled-by-you");
assert.equal(parityProducts.rows[0].totalPieces, 3, "Canceled-by-you pieces are excluded");
assert.equal(parityProducts.rows[0].revenue, 20, "Product table revenue field remains earned commission for UI compatibility");
assert.equal(parityProducts.rows[0].commission, 20, "Only delivered commission is earned");

function statusRows(bucket, count, start) {
  return Array.from({ length: count }, (_, i) => ({
    taagerOrderNumber: "STATUS-" + (start + i),
    taagerCountry: "SA",
    sku: "STATUS-SPLIT",
    products: "Status Split Product",
    orderStatusBucket: bucket,
    qty: 1,
    dashboardTotalPrice: 100,
    profitAfterTax: 10,
    city: "Riyadh",
  }));
}

const statusSplitRows = [
  ...statusRows("confirmed", 30, 0),
  ...statusRows("delivered", 10, 30),
  ...statusRows("failed", 10, 40),
  ...statusRows("return_verified", 10, 50),
  ...statusRows("canceled_by_you", 10, 60),
  ...statusRows("customer_refused_confirmation", 5, 70),
  ...statusRows("on_hold", 5, 75),
  ...statusRows("out_of_stock", 5, 80),
  ...statusRows("received", 15, 85),
];
const statusSplitService = createDashboardQueryService({
  getAccounts: () => ({ split: { snapshot: statusSplitRows } }),
  getAllowedAccountIds: () => ["split"],
  getRevision: () => 1,
});
const statusSplitProducts = statusSplitService.query({ kind: "products", accountIds: ["split"], page: 1, pageSize: 10 });
assert.equal(statusSplitProducts.pagination.total, 1, "Status split product is grouped into one product row");
assert.equal(statusSplitProducts.rows[0].statusTotalCount, 90, "Product status-rate base excludes canceled-by-you");
assert.equal(statusSplitProducts.rows[0].confirmationStatusCount, 60, "Failed and return-verified count as confirmed/progressed");
assert.equal(statusSplitProducts.rows[0].cancelStatusCount, 15, "Rejected pre-confirmation statuses count as cancel");
assert.equal(statusSplitProducts.rows[0].pendingStatusCount, 15, "Order received remains neutral pending");
assert.equal(statusSplitProducts.rows[0].netOrderCount, 90, "Product confirmation-rate base excludes canceled-by-you");
assert.equal(statusSplitProducts.rows[0].confirmationPct, 66.7, "Confirmation share uses net status total");
assert.equal(statusSplitProducts.rows[0].cancelPct, 16.7, "Cancel % uses net status total");
assert.equal(statusSplitProducts.rows[0].pendingPct, 16.6, "Pending % uses net status total");
assert.equal(
  statusSplitProducts.rows[0].confirmationPct + statusSplitProducts.rows[0].cancelPct + statusSplitProducts.rows[0].pendingPct,
  100,
  "Confirmation, cancel, and pending shares total 100%"
);
const statusSplitDetails = statusSplitService.query({
  kind: "product-details",
  accountIds: ["split"],
  productKeys: [statusSplitProducts.rows[0].key],
});
const statusCity = statusSplitDetails.details[statusSplitProducts.rows[0].key].cityBreakdown[0];
assert.equal(statusCity.statusTotalCount, 90, "Product detail city status base excludes canceled-by-you");
assert.equal(statusCity.netOrderCount, 90, "Product detail city confirmation-rate base excludes canceled-by-you");
assert.equal(statusCity.confirmationPct, 66.7, "Product detail city confirmation share uses status groups");
assert.equal(statusCity.cancelPct, 16.7, "Product detail city cancel % uses status groups");
assert.equal(statusCity.pendingPct, 16.6, "Product detail city pending % uses status groups");
assert.equal(statusCity.confirmationPct + statusCity.cancelPct + statusCity.pendingPct, 100, "City status shares total 100%");

const preserveAccounts = {
  sar: {
    country: "sa",
    snapshot: [
      {
        taagerOrderNumber: "SAME-ORDER",
        taagerCountry: "sa",
        createdAt: "2026-05-10",
        orderStatusBucket: "delivered",
        sku: "SKU-SA",
        products: "Saudi Product",
        nativeCurrency: "SAR",
        nativeTotalPrice: 100,
        nativeCommission: 20,
        city: "Riyadh",
      },
    ],
    marketing: { facebook: { summary: { currency: "SAR", campaignBreakdown: [
      { campaign: "Scale SKU-SA", country: "eg", spend: 50, currency: "SAR", clicks: 4, impressions: 400 },
    ] } } },
  },
  eg: {
    country: "eg",
    snapshot: [
      {
        taagerOrderNumber: "SAME-ORDER",
        taagerCountry: "eg",
        createdAt: "2026-05-10",
        orderStatusBucket: "delivered",
        sku: "SKU-EG",
        products: "Egypt Product",
        nativeCurrency: "EGP",
        nativeTotalPrice: 520,
        nativeCommission: 52,
        city: "Cairo",
      },
    ],
    marketing: { facebook: { summary: { currency: "EGP", campaignBreakdown: [
      { campaign: "Scale SKU-EG", country: "eg", spend: 520, currency: "EGP", clicks: 10, impressions: 1000 },
    ] } } },
  },
};
const preserveService = createDashboardQueryService({
  getAccounts: () => preserveAccounts,
  getAllowedAccountIds: () => ["sar", "eg"],
  getRevision: () => 1,
  getMarketingRevision: () => 1,
});
const preservedOrders = preserveService.query({
  kind: "orders",
  accountIds: ["eg", "sar", "eg", "unauthorized"],
  reportingCurrency: "SAR",
  exchangeRates: { USD: 1, SAR: 3.75, EGP: 52 },
  sortBy: "dashboardTotalPrice",
  sortDir: "desc",
  page: 1,
  pageSize: 10,
});
assert.deepEqual(preservedOrders.scope.accountIds, ["eg", "sar"], "Account scope is canonical and sorted");
assert.deepEqual(preservedOrders.scope.ignoredAccountIds, ["unauthorized"], "Unauthorized requested account IDs are returned for diagnostics");
assert.equal(preservedOrders.scope.accountCount, 2);
assert.equal(preservedOrders.pagination.total, 2, "Identical order numbers in two accounts remain separate");
assert.equal(preservedOrders.summary.totalValue, 137.5, "Mixed-country totals are normalized into reporting currency");
assert.equal(preservedOrders.rows[0].accountId, "sar", "Global sorting happens after combining accounts");
const preservedOrdersDifferentRate = preserveService.query({
  kind: "orders",
  accountIds: ["sar", "eg"],
  reportingCurrency: "SAR",
  exchangeRates: { USD: 1, SAR: 3.75, EGP: 26 },
  sortBy: "dashboardTotalPrice",
  sortDir: "desc",
  page: 1,
  pageSize: 10,
});
assert.equal(preservedOrdersDifferentRate.summary.totalValue, 175, "Changing exchange rates invalidates query cache and recalculates totals");
const preservedExport = preserveService.query({
  kind: "orders",
  accountIds: ["sar", "eg"],
  reportingCurrency: "SAR",
  exchangeRates: { USD: 1, SAR: 3.75, EGP: 52 },
  sortBy: "dashboardTotalPrice",
  sortDir: "desc",
  allRows: true,
});
assert.equal(preservedExport.rows.length, preservedOrders.pagination.total, "Orders export query matches filtered backend count");
assert.equal(preservedExport.rows[0].accountId, preservedOrders.rows[0].accountId, "Orders export uses the same global order as visible backend rows");
const countryBoundCampaigns = preserveService.query({
  kind: "campaign-overview",
  accountIds: ["sar", "eg"],
  reportingCurrency: "SAR",
  exchangeRates: { USD: 1, SAR: 3.75, EGP: 52 },
  platform: "all",
  campaignPage: 1,
  productPage: 1,
  pageSize: 10,
});
const mismatchedCountry = countryBoundCampaigns.campaignRows.find((row) => row.accountId === "sar" || row.dashboardAccountId === "sar");
assert.equal(mismatchedCountry.attributionVerified, false, "Campaigns never match products from another country");
assert.ok(countryBoundCampaigns.totals.spend >= 87.5, "Campaign spend is normalized into reporting currency while raw values are preserved");

const largeCampaignAccounts = {
  one: { snapshot: accounts.a1.snapshot.slice(0, 500), marketing: { tiktok: { summary: { currency: "USD", campaignBreakdown: [] } } } },
  two: { snapshot: accounts.a2.snapshot.slice(0, 500), marketing: { facebook: { summary: { currency: "SAR", campaignBreakdown: [] } } } },
};
for (let i = 0; i < 3000; i++) {
  const target = i % 2 ? largeCampaignAccounts.one.marketing.tiktok.summary : largeCampaignAccounts.two.marketing.facebook.summary;
  target.campaignBreakdown.push({
    campaign: (i % 3 ? "Scale SKU-" + (i % 40) : "Unmatched") + " " + i,
    spend: 10 + i % 20,
    clicks: 5 + i % 10,
    impressions: 100 + i,
    objective: i % 2 ? "sales" : "leads",
  });
}
let marketingRevision = 1;
const largeCampaignService = createDashboardQueryService({
  getAccounts: () => largeCampaignAccounts,
  getAllowedAccountIds: () => ["one", "two"],
  getRevision: () => 1,
  getMarketingRevision: () => marketingRevision,
});
const largeCampaignStartedAt = Date.now();
const largeCampaignPage = largeCampaignService.query({
  kind: "campaign-overview",
  accountIds: ["one", "two"],
  reportingCurrency: "SAR",
  campaignPage: 2,
  productPage: 1,
  pageSize: 10,
});
assert.equal(largeCampaignPage.campaignPagination.total, 3000);
assert.equal(largeCampaignPage.campaignRows.length, 10);
assert.ok(Date.now() - largeCampaignStartedAt < 300, "Campaigns query with 3,000 campaigns should complete within 300ms");
marketingRevision++;
assert.equal(largeCampaignService.query({ kind: "campaign-overview", accountIds: ["one"], pageSize: 10 }).ok, true);

revision++;
assert.equal(service.query({ kind: "orders", accountIds: ["a1"], page: 1, pageSize: 25 }).pagination.total, accounts.a1.snapshot.length);

console.log("[PASS] Dashboard query service: All Accounts, 15k orders, pagination, products, campaigns, lazy details, and revision cache");
