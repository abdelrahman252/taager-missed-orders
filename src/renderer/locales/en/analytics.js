(function () {
  'use strict';
  window.TAAGER_LOCALES = window.TAAGER_LOCALES || {};
  window.TAAGER_LOCALES.en = window.TAAGER_LOCALES.en || {};
  window.TAAGER_LOCALES.en.analytics = {
    header: {
      title: "Analytics",
      subtitle: "Track your orders, performance, and revenue."
    },
    tabs: {
      today: "Today",
      yesterday: "Yesterday",
      last2: "Last 2 Days",
      "7d": "Last 7 Days",
      thisMonth: "This Month",
      custom: "Custom Range"
    },
    dateCustom: {
      to: "to",
      apply: "Apply"
    },
    actions: {
      updateUploadedOrders: "Update Uploaded Orders"
    },
    runBanner: {
      singleRun: "Viewing single run from",
      showAll: "✕ Show all"
    },
    empty: {
      title: "No runs yet",
      desc: "Complete a bot run first — data will appear here automatically after each run.",
      bannerTitle: "Analytics is ready",
      bannerDesc: "Run the bot once to start filling these sections with real orders, revenue, COD, delivery, and failure data.",
      runAction: "Go to Run"
    },
    account: {
      label: "Account",
      allAccounts: "All Accounts",
      orders: "orders"
    },
    tour: {
      common: {
        quickGuide: "Quick Guide"
      },
      analytics: {
        kpis: {
          title: "Top KPI Blocks",
          body: "The KPI row aggregates orders, revenue, COD, delivery percentage, failed percentage, and time saved for the active date and account filters."
        },
        charts: {
          title: "Interactive Trend Curves",
          body: "The Chart.js canvases show dynamic daily distributions. Hover over nodes and bars to inspect day-by-day order, revenue, status, city, and product patterns."
        },
        table: {
          title: "Filterable Reporting Grid",
          body: "The table turns the chart data into custom reporting: filter, isolate runs, review order rows, and use it as the audit trail beneath the trend layer."
        }
      }
    },
    kpi: {
      totalOrders: "Total Orders",
      revenue: "Revenue",
      timeSaved: "Time Saved",
      timeSavedHelper: "Actual bot runtime saved from completed runs",
      cod: "Amount To Collect (COD)",
      deliveredPct: "Delivered %",
      failedPct: "Failed %",
      prevSameDay: "vs same day last week",
      prev2Days: "vs prev 2 days",
      prev7Days: "vs prev 7 days",
      prevMonth: "vs prev month",
      prevPeriod: "vs prev period"
    },
    charts: {
      revenueTitle: "Revenue Over Time",
      ordersTitle: "Order Performance",
      statusTitle: "Order Status Breakdown",
      statusSub: "Orders by status",
      salesByProduct: "Sales by Product",
      productPerformanceCta: "Product Performance",
      salesSub: "Top performing products",
      delivered: "Delivered",
      failed: "Failed",
      pending: "Pending",
      confirmed: "Confirmed",
      waiting: "Waiting",
      processing: "Processing",
      shipping: "Shipping",
      topCities: "Top Cities",
      deliveryFunnel: "Delivery Funnel",
      ordersHeatmap: "Orders Heatmap",
      ordersByHour: "Orders By Hour",
      byOrders: "By Orders",
      byRevenue: "By Revenue",
      noData: "No data for this period",
      noHourlyData: "No order time data for this period",
      noCityData: "No city data yet.",
      noProductData: "No product data yet.",
      noOrdersYet: "No orders yet",
      ordersLabel: "orders",
      total: "Total",
      revenueMetric: "Revenue",
      subtitleDaily: "Daily order submission volume.",
      subtitlePeak: "Peak: {count} orders on {date}.",
      heatmapLegend: "Legend (orders per day)",
      heatmapLegendValues: {
        noActivity: "0 orders (No activity)",
        lowVolume: "1-3 orders (Low volume)",
        mediumVolume: "4-10 orders (Medium volume)",
        highVolume: "11-25 orders (High volume)",
        peakVolume: "26+ orders (Peak volume)"
      }
    },
    table: {
      title: "Orders Explorer",
      searchPlaceholder: "Search name, phone, or city...",
      filterAll: "All",
      filterDelivered: "Delivered",
      filterFailed: "Failed",
      filterPending: "Pending",
      colCustomer: "Customer",
      colContact: "Contact",
      colLocation: "Location",
      colOrder: "Order",
      colValue: "Value",
      colStatus: "Status",
      colTime: "Time",
      colProduct: "Product",
      colQty: "Qty",
      colSource: "Source",
      statusAll: "Status (All)",
      allSources: "All Sources",
      sourceReal: "Real",
      sourceMissed: "Missed",
      allAccounts: "All Accounts",
      perPage: "{count} per page",
      clearSort: "Clear Sort",
      export: "Export",
      emptyFilters: "No orders match the current filters.",
      paginationInfo: "Showing {start} to {end} of {total} orders",
      prev: "Prev",
      next: "Next"
    },
    insights: {
      title: "Smart Insights",
      peakTime: "Peak Time",
      peakTimeDesc: "Most orders processed at",
      topProduct: "Top Product",
      topProductDesc: "Best selling item is",
      successRate: "Success Rate",
      successRateDesc: "of orders completed successfully",
      noData: "Not enough data to generate insights",
      emptyHint: "Run the bot a few times to generate insights.",
      count: "{count} insights",
      showMore: "Show {count} more",
      dynamic: {
        trend: "Orders <strong class=\"{trendClass}\">{trendText} {pct}%</strong> compared to the previous period.",
        increased: "increased",
        decreased: "decreased",
        failedCity: "Failed orders concentrated in <strong class=\"insight-warn\">{city}</strong> — {count} failures ({rate}% total fail rate).",
        unknown: "Unknown",
        bestProduct: "Best selling product: <strong>{product}</strong> — <span class=\"insight-value\">{count} orders</span>.",
        highCod: "High COD pending: <span class=\"insight-value\">{amount}</span> awaiting collection across {count} orders.",
        bestHour: "Best delivery window: <span class=\"insight-good\">{start}–{end}</span> has the highest delivery rate.",
        commission: "Marketer commission earned: <span class=\"insight-good\">{total}</span> (avg <span class=\"insight-value\">{avg}</span> per order).",
        missed: "{pct}% of orders are <span class=\"{cssClass}\">{missedLabel}</span> — consider reviewing the missed orders pipeline.",
        missedLabel: "Missed orders",
        processing: "<span class=\"insight-warn\">{count} orders</span> are still Under Processing — follow up with the shipping team.",
        shipping: "<span class=\"insight-value\">{count} orders</span> are In Shipping and expected to deliver soon{commPart}.",
        shippingComm: " (<span class=\"insight-good\">{amount}</span> commission incoming)",
        waiting: "<span class=\"insight-warn\">{count} orders</span> are stuck in <strong>Waiting</strong> status — may need manual follow-up with the courier.",
        confirmed: "<span class=\"insight-value\">{count} orders</span> are <strong>Confirmed</strong> and being prepared for shipment.",
        canceled: "Cancellation rate is <span class=\"insight-bad\">{rate}%</span> — {count} orders canceled. Review product quality and phone validation."
      }
    },
    timeline: {
      title: "Activity Timeline",
      empty: "No activity",
      runCompleted: "Run completed successfully",
      ordersProcessed: "Processed {count} orders",
      runFailed: "Run Failed",
      runFailedDesc: "An error occurred while processing orders",
      eventsCount: "{count} events",
      pageOf: "Page {current} of {total}",
      ordersSubmitted: "{count} orders submitted",
      failed: "{count} failed",
      multiAccountLabel: "Multi-account",
      multiAccount: "Multi-account execution",
      singleAccount: "Single account",
      runStarted: "Run started"
    },
    utils: {
      time: {
        justNow: "just now",
        mAgo: "{m}m ago",
        hAgo: "{h}h ago",
        dAgo: "{d}d ago"
      }
    }
  };
})();
