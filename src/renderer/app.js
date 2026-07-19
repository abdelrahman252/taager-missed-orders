// ── APP ROUTER ──

let sessionDate = null;

// ── Global state ──
window._kbotLang  = window.__TAAGER_BOOT_LANG || "ar";
window._kbotTheme = "dark";
window._kbotUser  = { customerName: null, daysLeft: null };

// ── i18n strings ──
// Defined once at module level — never re-created per call.
const _STRINGS = {
  en: {
    "topbar.welcome": (n) => n ? `Welcome, ${n}` : "Welcome",
    "topbar.days":    (d) => d != null ? `${d} day${d !== 1 ? "s" : ""} remaining` : "",
    "topbar.expires": "License expires soon",
    "topbar.analytics":   "Analytics",
    "topbar.operations":  "Operations",
    "topbar.run_results": "Run Results",
    "topbar.dashboard":   "Dashboard",
    "topbar.notifications": "Notifications",
    "titlebar.sync":      "Sync",
    "titlebar.sync_tooltip": "Refresh the whole app.",
    "titlebar.clear_cache": "Clear Cache",
    "titlebar.clear_cache_tooltip": "Clear local cache and reload the app.",
    "titlebar.clear_cache_confirm": "This clears local cache and reloads the app. It will not delete accounts, license, or orders. Continue?",
    "titlebar.clearing_cache": "Clearing...",
    "titlebar.lang_tooltip": "Switch between English and Arabic.",
    "titlebar.theme_tooltip": "Switch between light and dark theme.",
    "titlebar.zoom_group": "Application zoom",
    "titlebar.zoom_in": "Zoom in",
    "titlebar.zoom_out": "Zoom out",
    "titlebar.zoom_reset": "Reset zoom to 100%",
    "titlebar.minimize": "Minimize window",
    "titlebar.maximize": "Maximize or restore window",
    "titlebar.close": "Close Taager Bot",
    "preloader.workspace.title": "Preparing workspace...",
    "preloader.workspace.session": "Checking your saved session...",
    "preloader.workspace.settings": "Loading app settings...",
    "preloader.workspace.ready": "Preparing your workspace...",
    "preloader.dashboard.stage.engine.label": "Dashboard engine",
    "preloader.dashboard.stage.engine.body": "Loading dashboard code, styles, and controls.",
    "preloader.dashboard.stage.snapshot.label": "Saved snapshots",
    "preloader.dashboard.stage.snapshot.body": "Reading saved account snapshots from this device.",
    "preloader.dashboard.stage.accounts.label": "Accounts",
    "preloader.dashboard.stage.accounts.body": "Matching accounts, countries, currencies, and date range.",
    "preloader.dashboard.stage.metrics.label": "Metrics",
    "preloader.dashboard.stage.metrics.body": "Preparing orders, revenue, profit, COD, and NDR metrics.",
    "preloader.dashboard.stage.modules.label": "Dashboard views",
    "preloader.dashboard.stage.modules.body": "Building product, city, campaign, calculator, and master views.",
    "preloader.dashboard.stage.marketing.label": "Marketing spend",
    "preloader.dashboard.stage.marketing.body": "Checking connected marketing spend for the selected range.",
    "preloader.dashboard.stage.rendering.label": "Rendering",
    "preloader.dashboard.stage.rendering.body": "Rendering the final dashboard view.",
    "preloader.dashboard.activity.starting": "Starting dashboard...",
    "preloader.dashboard.activity.engineLoaded": "Dashboard engine loaded",
    "preloader.dashboard.activity.snapshotPayload": "Loading saved snapshot payload",
    "preloader.dashboard.activity.savedSnapshots": "Reading saved dashboard snapshots",
    "preloader.dashboard.activity.accountScope": "Matching dashboard account scope",
    "preloader.dashboard.activity.metrics": "Preparing dashboard metrics",
    "preloader.dashboard.activity.views": "Building dashboard views",
    "preloader.dashboard.activity.viewsPrepared": "Dashboard views prepared",
    "preloader.dashboard.activity.marketing": "Checking connected marketing spend",
    "preloader.dashboard.activity.marketingSync": "Syncing connected marketing spend",
    "preloader.dashboard.activity.marketingCached": "Checking cached marketing status",
    "preloader.dashboard.activity.rendering": "Rendering final dashboard",
    "preloader.dashboard.activity.ready": "Dashboard ready.",
    "preloader.dashboard.activity.bestData": "Dashboard opened with the best available data.",
    "preloader.dashboard.activity.metricsPrepared": "Dashboard metrics prepared",
    "preloader.dashboard.activity.emptyMetrics": "Preparing empty dashboard metrics",
    "preloader.dashboard.activity.noSnapshot": "No saved account snapshot yet",
    "preloader.dashboard.activity.accountSnapshotsLoaded": (n) => `${n} account snapshots loaded`,
    "preloader.dashboard.activity.rowsSelected": (n) => `${n} rows in selected period`,
    "preloader.dashboard.activity.ordersPrepared": (n) => `${n} orders prepared`,
    "setup.nav_dashboard": "Dashboard",
    "setup.nav_ai": "Taager AI",
    "setup.update_dashboard_btn": "Update Dashboard",
    "setup.title":        "Welcome to Taager Bot",
    "setup.subtitle":     "Enter your credentials once — they're stored securely on this device.",
    "setup.easy_section": "📦 Easy-Orders Account",
    "setup.cms_section": "CMS Account",
    "setup.cms_label": "CMS / Order Source",
    "setup.cms_easyorders": "EasyOrders",
    "setup.cms_lightfunnels": "LightFunnels",
    "setup.lightfunnels_account_label": "Account Name",
    "setup.lightfunnels_account_ph": "e.g. trendatsaudi",
    "setup.lightfunnels_login_method": "LightFunnels Login Method",
    "setup.lightfunnels_login_email": "Email + Password",
    "setup.lightfunnels_login_google": "Google",
    "setup.lightfunnels_google_hint": "Google login will open Chrome during the LightFunnels login phase.",
    "setup.lightfunnels_required_hint": "LightFunnels account name, email, and password are required for this account.",
    "setup.taager_section": "🛒 Taager Account",
    "setup.country_label": "Country",
    "setup.country_sa": "🇸🇦 Saudi Arabia (SA)",
    "setup.country_eg": "Egypt (EG)",
    "setup.country_iq": "Iraq (IQ)",
    "setup.country_ae": "United Arab Emirates (AE)",
    "setup.country_om": "Oman (OM)",
    "setup.country_hint": "Choose the Taager market used for login, exports, and order upload.",
    "setup.country_sa_only": "Choose the Taager market used for login, exports, and order upload.",
    "setup.store_label":  "Store Name",
    "setup.store_hint":   "(required)",
    "setup.store_ph":     "e.g. themnzl",
    "setup.missing_orders_store_label": "Missing Orders Store Name",
    "setup.missing_orders_store_ph": "Enter the Taager Missing Orders store name",
    "setup.missing_orders_store_hint": "Used in Taager's Missing Orders upload modal. Required when Route Missed Orders is ON.",
    "setup.missing_orders_store_no_accounts": "Select at least one EasyOrders account to set the Missing Orders store name.",
    "setup.affiliate_recovery_label": "EasyOrders Affiliate Recovery",
    "setup.affiliate_recovery_hint": "When enabled, this feature resends missing EasyOrders real orders and converts missed orders, then verifies them from Taager exports.",
    "setup.account_identity_section": "Account Display",
    "setup.account_name_label": "Account Name",
    "setup.account_name_ph": "e.g. Riyadh Team, Main Store",
    "setup.account_name_hint": "Shown first in account lists; email stays underneath for reference.",
    "setup.email_label":  "Email",
    "setup.email_ph":     "you@example.com",
    "setup.pass_label":   "Password",
    "setup.taager_email_ph":"affiliate@taager.com",
    "setup.taager_login_method": "Taager Login Method",
    "setup.taager_login_email": "Email + Password",
    "setup.taager_login_phone": "Phone + Password",
    "setup.taager_login_google": "Google Login",
    "setup.taager_google_hint": "Google login opens Chrome for manual account confirmation. Account locking uses Taager merchant ID + country.",
    "setup.taager_phone_label": "Taager Phone",
    "setup.taager_phone_ph": "5xxxxxxxx",
    "setup.save_btn":     "Save & Continue →",
    "setup.dashboard_enrichment_label":        "Dashboard Data Source",
    "setup.dashboard_enrichment_taager":        "Taager Only",
    "setup.dashboard_enrichment_easyorders":    "Taager + EasyOrders",
    "setup.dashboard_enrichment_lightfunnels":  "Taager + LightFunnels",
    "setup.dashboard_enrichment_hint_taager":   "Your dashboard will use Taager as the only data source for orders, profits, and product info. Simple and fast — recommended if you don't use EasyOrders.",
    "setup.dashboard_enrichment_hint_easyorders": "Your dashboard will pull orders and profits from Taager, and also connect to EasyOrders to enrich product names and payment data. Best choice if you use both platforms.",
    "setup.dashboard_enrichment_hint_lightfunnels": "This account is wired as a LightFunnels CMS account. Dashboard automation will use this provider in the next phase.",
    "setup.err_missing":  "<strong>Missing fields</strong> — All required fields must be filled.",
    "setup.err_locked":   "<strong>Account Locked</strong> — This license is already linked to different accounts. Contact support to change them.",
    "welcome.app_title":      "Taager Bot",
    "welcome.app_subtitle":   "Automate your daily order processing",
    "welcome.quick_start":    "Quick Start",
    "welcome.today_btn":      (d) => `📅 Continue — Today (${d})`,
    "welcome.new_date_btn":   "🗓️ New Date / Range",
    "welcome.launch_min":     "🔕 Minimize Chrome",
    "welcome.launch_min_desc":"When ON, Chrome stays minimized during bot runs. The app window keeps its current state.",
    "welcome.autoconfirm_title": "🤖 Auto-Confirm Orders",
    "welcome.autoconfirm_desc":  "When ON, bot clicks confirm automatically. Keep OFF until you fully trust the output.",
    "welcome.missing_orders_title": "📥 Route Missed Orders",
    "welcome.missing_orders_desc":  "When ON, resolved EasyOrders missed-source orders go to Taager's legacy Missing Orders uploader. Real orders still go to the normal cart. Saudi accounts only.",
    "welcome.affiliate_recovery_title": "Affiliate Recovery",
    "welcome.affiliate_recovery_desc": "Resend missing EasyOrders real orders and convert missed orders, then verify them from Taager exports.",
    "welcome.autorun":        "⏱️ Auto-Run",
    "welcome.autorun_desc":   "Automatically run for today's orders on a schedule.",
    "welcome.run_every":      "Run Every",
    "welcome.select_date":    "Select Date",
    "welcome.today":          "Today",
    "welcome.single_day":     "Single Day",
    "welcome.pick_one":       "Pick one date",
    "welcome.date_range":     "Date Range",
    "welcome.from_to":        "From → To",
    "welcome.from":           "From",
    "welcome.to":             "To",
    "welcome.launch_btn":     "🚀 Launch Bot",
    "welcome.reset_section":  "⚠️ Reset",
    "welcome.reset_notice":   "<strong>New Login Credentials?</strong>Clears all saved credentials, sessions, and cookies. You'll be asked to log in again.",
    "welcome.reset_btn":      "Reset All Data & Credentials",
    "welcome.reset_confirm_title": "Reset All Data?",
    "welcome.reset_confirm_msg":   "This will delete all saved credentials, browser sessions, and cookies. You'll need to enter your login details again.",
    "welcome.reset_confirm_ok":    "Reset Everything",
    "welcome.reset_confirm_cancel":"Cancel",
    "welcome.off":            "OFF",
    "welcome.on":             "ON",
    "welcome.next_run":       (m, s) => `⏳ Next auto-run in ${m}:${s}`,
    "run.title":          "Running Bot",
    "run.starting":       "● Starting...",
    "run.stop":           "⏹ Stop",
    "run.home":           "🏠 Home",
    "run.phase0":         "Easy-Orders Login",
    "run.phase1":         "Real Orders Export",
    "run.phase2":         "Missed Orders Export",
    "run.phase3":         "Taager Login & Export",
    "run.phase4":         "Upload Orders to Taager",
    "run.waiting":        "Waiting...",
    "run.2fa_title":      "2FA Required",
    "run.2fa_msg":        "Complete two-step verification in the browser window, then return here.",
    "run.confirm_title":  "Action Required — Review & Confirm Orders",
    "run.confirm_msg":    "Review in the browser window, then click <strong>تأكيد كل الطلبات</strong>. Bot is waiting (up to 10 min).",
    "run.restart_title":  "Taager Export Failed - Restarting Automatically",
    "run.restart_wait":   "Please wait — retrying in",
    "run.ratelimit_title":"Rate Limit — Cooldown in Progress",
    "run.creating":       "📤 Uploading Orders to Taager",
    "run.live_log":       "Live Log",
    "run.cooldown_label": "Cooldown — Easy-Orders Rate Limit",
    "run.cooldown_next":  "Next run available in",
    "run.preview_header": (n) => `📋 ${n} orders ready — uploading now`,
    "run.preview_cols":   ["Product", "Qty", "Price", "Date", "City", "Name", "Phone"],
    "run.progress_start": "Starting...",
    "results.title":      (d) => `Results — ${d}`,
    "results.completed":  "Bot run completed",
    "results.home":       "🏠 Home",
    "results.run_again":  "🔄 Run Again",
    "results.download":   "⬇️ Download Excel",
    "results.download_failed": "⬇️ Download Failed Orders",
    "results.couldnt_process_btn": "Warnings / Skipped",
    "results.couldnt_process_title": (n) => `Warnings / Skipped — ${n} order${n !== 1 ? "s" : ""}`,
    "results.skipped_followup": "Uploaded warnings need verification; skipped orders need manual follow-up",
    "results.warning_status_col": "Outcome",
    "results.warning_uploaded": "Uploaded with warning",
    "results.warning_skipped": "Skipped",
    "results.raw_phone_col": "Raw Phone",
    "results.normalized_phone_col": "Normalized Phone",
    "results.source_col": "Source",
    "results.sku_product_col": "SKU/Product",
    "results.message_col": "Message",
    "results.uncertain_orders_title": "Uncertain Orders",
    "results.uncertain_orders_need_review": "{count} need review",
    "results.reason_col": "Reason",
    "results.reason_phone_parse_failed": "Invalid phone number",
    "results.reason_phone_uncertain_zero_appended": "Phone missing digit — trailing 0 added (uncertain)",
    "results.reason_product_not_in_catalog": "Product not found in EasyOrders sheet or Taager sheet",
    "results.reason_product_not_in_easyorders_or_taager": "Product not found in EasyOrders sheet or Taager sheet",
    "results.reason_partial_order_already_in_taager": "Some products already exist in Taager - review before creating another shipping order",
    "results.reason_missing_sku_in_group": "Grouped order has a missing SKU",
    "results.reason_source_order_already_in_taager": "Same EasyOrders order already exists in Taager",
    "results.reason_delivered_order_already_in_taager": "Delivered order already exists with the same phone, SKU, and created date",
    "results.reason_delivered_repeat_needs_identity": "Delivered history exists, but source order ID/date cannot prove this is a new order",
    "results.reason_no_trusted_product_reference": "No trusted product reference",
    "results.reason_normal_flow_prepared_quantity_is_suspicious": "Suspicious prepared quantity",
    "results.reason_duplicate_easyorders_uuid_conflicting_phone": "Same EasyOrders order has conflicting phone candidates",
    "results.reason_skipped_manual": "Manual review",
    "results.message_no_trusted_product_reference": "No trusted product history exists; not submitted automatically.",
    "results.confirmed_orders_table": "New Orders Confirmed in Taager",
    "results.phone_rescued_verify": "Phone rescued with trailing 0 — verify before calling",
    "results.new_orders": "New Orders",
    "results.in_taager":    "Already in Taager",
    "results.dupes":      "Duplicates Removed",
    "results.failed":     "Failed on Taager",
    "results.all_caught": "All caught up!",
    "results.no_orders":  "No new orders to process for this date range.",
    "results.from_real":  "From Real Orders",
    "results.from_missed":"From Missed Orders",
    "results.new_unique": "new unique orders",
    "results.by_product": "📦 Orders by Product",
    "results.no_product": "No product data available.",
    "results.product":    "Product Name",
    "results.orders":     "Orders",
    "results.total_qty":  "Total Qty",
    "results.total":      "Total",
    "results.fail_title": (n) => `${n} Order${n > 1 ? "s" : ""} Failed - Rejected by Taager`,
    "results.product_count": (n) => n === 1 ? "order" : "orders",
    "results.fail_saved": "Saved to your device. Check the folder for details.",
    "results.failed_table_hint": "Compact preview. Hover any clipped cell for the full product or error text.",
    "results.open_folder":"📁 Open Folder",
    "results.all_ok":     "<strong>All orders uploaded and confirmed</strong> No failed orders this run.",
    "results.row":        "Row",
    "results.sku":        "SKU",
    "results.phone":      "Phone",
    "results.error":      "Error",
    // setup page — accounts step
    "setup.nav_accounts":       "Accounts",
    "setup.nav_analytics":      "Analytics",
    "setup.nav_operations":     "Operations",
    "setup.nav_run_results":    "Run Results",
    "setup.nav_notifications":  "Notifications",
    "setup.nav_run":            "Run",
    "setup.sub_title":          "Setup",
    "setup.reset_creds_btn":    "Reset Credentials",
    "setup.check_updates_btn":  "Check for Updates",
    "setup.report_issue_btn":  "Report an Issue",
    "setup.app_version":        (v) => `App version is v${v}`,
    "setup.checking_updates":   "\u{23F3} Checking...",
    "update.btn_title_checking": "Checking for updates...",
    "update.btn_title_check":    "Check for updates",
    "update.downloading_action": "Downloading...",
    "update.dev_title":          "Dev Mode",
    "update.dev_sub":            "Auto-update only works in packaged app.",
    "update.ok":                 "OK",
    "update.check_failed_title": "Update Check Failed",
    "update.unknown_error":      "Unknown error",
    "update.dismiss":            "Dismiss",
    "update.available_title":    (v) => `Update v${v} Available`,
    "update.available_sub":      "A new version is ready to download.",
    "update.download_update":    "Download Update",
    "update.up_to_date_title":   "You're up to date",
    "update.up_to_date_sub":     "No new version found.",
    "update.downloading_title":  "Downloading Update...",
    "update.download_progress":  (p) => `${p}% complete`,
    "update.ready_title":        "Update Ready to Install",
    "update.ready_sub":          "Restart the app to apply the update.",
    "update.restart_install":    "\u{1F680} Restart & Install",
    "update.error_title":        "Update Error",
    "update.error_sub":          "An unknown error occurred during update.",
    "setup.manage_title":       "Manage Accounts",
    "setup.manage_sub":         "Add, edit, or remove your accounts. Selection happens on the next step.",
    "setup.your_accounts":      "Your Accounts",
    "setup.your_accounts_desc": "Manage the accounts available for running tasks.",
    "setup.add_account":        "Add Account",
    "setup.account_type":       "Account type",
    "setup.normal_account":     "Normal Account",
    "setup.static_account":     "Static Account",
    "setup.static_badge":       "Static",
    "setup.static_name":        "Account name",
    "setup.static_name_placeholder": "Example: Jake",
    "setup.static_name_required": "Account name is required.",
    "setup.static_hint":        "This account uses Excel Static Update and does not connect to Taager, EasyOrders, or LightFunnels.",
    "setup.next_btn":           "Next: Run Setup →",
    "setup.continue_date":      "Continue to date",
    "setup.run_title":          "Run Execution",
    "setup.run_sub":            "Select users, pick a date, then launch.",
    "setup.select_users":       "Select Users",
    "setup.select_users_desc":  "Choose one or more users to run the task.",
    "setup.all_users":          "All Users",
    "setup.select_all":         "Select All",
    "setup.select_date":        "Select Date",
    "setup.select_date_desc":   "Choose when you want to run the task.",
    "setup.today_mode":         "📅 Today",
    "setup.single_mode":        "🗓️ Single",
    "setup.range_mode":         "📆 Range",
    "setup.summary":            "Summary",
    "setup.summary_desc":       "Review your selections before running.",
    "setup.users_selected":     "Users Selected",
    "setup.date_range":         "Date Range",
    "setup.total_days":         "Total Days",
    "setup.back_btn":           "← Back",
    "setup.run_btn":            "🚀 Run Execution",
    "setup.run_security":       "🔒 This action will be executed for the selected users and date range.",
    "setup.select_user_to_launch":"Select at least one user to launch.",
    "setup.date_label":         "Date",
    "setup.start_date":         "Start Date",
    "setup.end_date":           "End Date",
    "setup.today_running":      (d) => `✅ Selected: Today - ${d}`,
    "setup.locked":             "Locked",
    "setup.unlocked":           "Unlocked",
    "setup.active":             "Active",
    "setup.edit_btn":           "✏️ Edit",
    "setup.delete_btn":         "Delete",
    "setup.rename_btn":         "Rename",
    "setup.edit_account":       "Edit Account",
    "setup.rename_account":     "Rename Account",
    "setup.add_member_name":     "Edit name",
    "setup.edit_member_name":    "Edit name",
    "setup.member_name_title":   "Edit name",
    "setup.member_name_subtitle":"Name this account for your team. Credentials stay unchanged.",
    "setup.member_name_label":   "Name",
    "setup.member_name_ph":      "e.g. Ahmed - Riyadh team",
    "setup.member_name_hint":    "This name appears first across the app. If empty, we show the email instead.",
    "setup.clear_member_name":   "Clear",
    "setup.save_member_name":    "Save Name",
    "setup.new_account":        "New Account",
    "setup.form_subtitle":      "Fill in credentials for this account.",
    "setup.keep_pass":          "Leave blank to keep existing",
    "setup.cancel_btn":         "Cancel",
    "setup.save_btn2":          "💾 Save",
    "setup.add_btn":            "➕ Add Account",
    "setup.saving":             "Saving...",
    "setup.limit_reached":      "License limit reached — cannot add more accounts.",
    "setup.save_failed":        "Failed to save.",
    "setup.remove_confirm":     "Remove this account?",
    "setup.reset_confirm_title":"Reset All Data?",
    "setup.reset_confirm_msg":  "This will delete all saved credentials, browser sessions, and cookies. You'll need to enter your login details again.",
    "setup.reset_confirm_ok":   "Reset Everything",
    "setup.reset_confirm_cancel":"Cancel",
    "setup.locked_title":       "Locked by admin — contact support to reset",
    "setup.license_one":        "License: 1 account only",
    "setup.license_max":        (n) => `Max ${n} accounts`,
    "setup.users_count":        (n) => `${n} user${n !== 1 ? "s" : ""}`,
    "setup.accounts_count":     (n) => `${n} account${n !== 1 ? "s" : ""}`,
    "setup.days_count":         (n) => `${n} day${n !== 1 ? "s" : ""}`,
    // run page extra
    "run.phase_complete":  "Complete ✓",
    "run.phase_running":   "Running...",
    "run.stop_title":      "Stop the bot?",
    "run.stop_msg":        "The current run will be terminated immediately. Any orders not yet uploaded will be lost.",
    "run.stop_cancel":     "Cancel",
    "run.stop_confirm":    "Stop Bot",
    // previously hardcoded strings — now translated
    "setup.taager_pass_hint":       "Leave blank to keep existing password",
    "results.run_failed":         "Bot run failed",
    "results.error_occurred":     "An error occurred. Check the log for details.",
    "results.internet_issue":     "Internet connection or website timeout. The bot retries recoverable EasyOrders pages automatically; if the run stops, check your internet and run again.",
    "results.multi_all_ok":       "All accounts completed successfully.",
    "results.multi_some_errors":  "Some accounts had errors. Select an account from the dropdown to see details and download.",
    "run.all_accounts":           "🌐 All Accounts",
    "results.all_accounts":       "🌐 All Accounts — Overview",
    "results.per_account_summary":"📊 Per-Account Summary",
    // welcome page account selector
    "welcome.select_accounts":    "Select Accounts",
    "welcome.acc_selected":       (n) => `${n} selected`,
    "welcome.parallel_hint":      "Selecting multiple accounts will run them in parallel, each in its own Chrome window.",
    // run page badge / log strings
    "run.badge_running":          "● Running",
    "run.badge_stopped":          "⏹ Stopped",
    "run.badge_done":             "✅ Done",
    "run.badge_all_done":         "✅ All Done",
    "run.badge_done_errors":      "⚠️ Done with errors",
    "run.badge_failed":           "❌ Failed",
    "run.badge_license_expired":  "🔒 License Expired",
    "run.badge_awaiting":         "👀 Awaiting Confirmation",
    "run.badge_cooldown":         "⏸️ Cooldown",
    "run.badge_restarting":       "🔄 Restarting...",
    "run.badge_uploading":        (c, tot) => `📤 Uploading ${c}/${tot}`,
    "run.badge_uploading_short":  "📤 Uploading",
    "run.badge_action_required":  "👀 Action Required",
    "run.orders_ready":           "Orders Ready",
    "run.log_starting":           "🚀 Starting bot...",
    "run.log_date_range":         (f, to) => `📅 Date range: ${f} → ${to}`,
    "run.log_completed":          "✅ Bot completed successfully!",
    "run.log_license_expired":    "🔒 License key has expired. Please enter your license for this month.",
    "run.log_license_expired_short": "🔒 License key has expired.",
    "run.notif_action_title":     "Taager Bot - Action Required",
    "run.notif_action_body":      "Please review and confirm orders in the browser window.",
    "run.notif_2fa_title":        (tag) => `2FA Required${tag}`,
    "run.notif_2fa_body":         "Check the browser window.",
    "run.notif_confirm_title":    (tag) => `Action Required${tag}`,
    "run.notif_confirm_body":     "Confirm orders in the browser.",
    "run.cooldown_attempt":       (a, m, s) => `Attempt ${a}/${m} — waiting ${s}s before re-triggering export.`,
    "run.restart_reason":         (r) => `Reason: ${r}`,
    "run.restart_attempt":        (a, m) => `Attempt ${a}/${m}`,
    "run.all_phases_done":        "All phases done",
    "run.all_accounts_label":     "All Accounts",
    "run.showing_label":          "Showing:",
    "run.phase_status_n":         (n) => `🔄 Phase ${n}`,
    "run.phase_status_active":    "🔄 Running",
    "run.click_to_copy":          "click any cell to copy",
    "run.click_cells_copy":       "click cells to copy",
    "run.download":               "Download",
    "run.search_orders_placeholder": "Search by name, phone, or product...",
    "run.upload_placeholder":     "Upload progress and order table will appear here",
    "run.no_new_orders_found":    "No New Orders Found",
    // results page strings
    "results.unknown":            "Unknown",
    "results.no_product_data":    "No product data",
    "results.no_error_info":      "No detailed error info available.",
    "results.search_orders_placeholder": "Search by customer, phone, product, date, or city...",
    "results.no_orders_found":    "No orders match your search.",
    "results.product_col":        "Product",
    "results.customer_name_col":  "Customer Name",
    "results.phone_col":          "Phone",
    "results.qty_col":            "Qty",
    "results.price_col":          "Price",
    "results.easy_created_at_col": "EasyOrders Created",
    "results.city_col":           "City",
    "results.orders_col":         "Orders",
    "results.total_qty_col":      "Total Qty",
    "results.account_col":        "Account",
    "results.status_col":         "Status",
    "results.destination_col":     "Destination",
    "results.destination_cart":    "Cart",
    "results.destination_missing": "Missing Orders",
    "results.destination_second":  "Second Cart",
    "results.row_col":            "Row",
    "results.error_col":          "Error",
    "results.ok_status":          "OK",
    "results.error_status":       "Error",
    "results.all_orders_label":   "All Orders",
    "results.all_uploaded":       "All Uploaded Orders",
    "results.all_uploaded_all":   "All Uploaded Orders — All Accounts",
    "results.all_attempted":      "All Attempted Orders",
    "results.all_attempted_all":  "All Attempted Orders - All Accounts",
    "results.upload_success_rate":"Upload Success Rate",
    "results.overall_success_rate":"Overall Success Rate",
    "results.orders_by_product":  "Orders by Product",
    "results.order_sources":      "Order Sources",
    "results.uploaded_orders_title": "Uploaded Orders",
    "results.uploaded_or_submitted_orders_title": "Uploaded / Submitted Orders",
    "results.new_or_submitted_orders": "New / Submitted Orders",
    "results.submission_success_rate": "Submission Success Rate",
    "results.confirmed_plus_missing": (confirmed, missing) => `${confirmed} cart confirmed + ${missing} Missing Orders submitted`,
    "results.missing_orders_pending_title": "Missing Orders are submitted, not confirmed cart orders",
    "results.missing_orders_pending_body": "Taager accepted the Missing Orders workbook, but those rows may not appear immediately in the normal Taager orders list. Check the Missing Orders tab, or route missed orders to Cart/Second Cart when you need confirmed normal orders.",
    "results.affiliate_recovery_title": "EasyOrders Affiliate Recovery",
    "results.affiliate_recovery_verified": "Verified in Taager",
    "results.affiliate_recovery_failed": "Found in Taager failed orders",
    "results.affiliate_recovery_unresolved": "Not found after retry",
    "results.affiliate_recovery_sent_as_is": "Sent as-is",
    "results.affiliate_recovery_skipped": "Skipped",
    "results.all_products_combined":"All Products — Combined",
    "results.failed_uploads_total":"Failed uploads total",
    "results.all_uploaded_ok":    "All uploaded OK",
    "results.already_in_system":  "Already in system",
    "results.duplicate_phone":    "Duplicate phone+product",
    "results.confirmed_in_taager_cart": "Confirmed in Taager cart",
    "results.sent_to_easy":       "Orders sent to Easy-Orders",
    "results.failed_uploads":     "Failed uploads",
    "results.all_ok_short":       "All OK",
    "results.orders_failed_upload":"Orders that failed to upload",
    "results.all_orders_ok":      "All orders uploaded OK",
    "results.succeeded":          (n) => `✅ ${n} succeeded`,
    "results.total_attempted":    (n) => `${n} total attempted`,
    "results.already_in_taager_n":  (n) => `+${n} already in Taager`,
    "results.across_accounts":    "Across all accounts",
    "results.products_click":     (n) => `${n} products · click to copy`,
    "results.accounts_click":     (n) => `${n} accounts · click for details`,
    "results.orders_count":       (n) => `(${n} orders)`,
    "results.select_acc_sidebar": "select an account in the sidebar to see its details",
    "results.uploading_detail":   (c, tot, s, f) => `📤 Uploading: ${c}/${tot} · ✅${s} ❌${f}`,
    // setup page cancel button
    "setup.cancel_btn":           "Cancel",
    "run.tab_status":             "⚙️ Status & Progress",
    "run.tab_log":                "📋 Live Log",
    "run.phases_header":          "⚙️ Phases",
    "run.waiting_upload":         "Waiting for upload data…",
    "run.switch_live_log":        "Switch to Live Log tab to see real-time output",
    "run.click_account_card":     "Click any account card to see its details, or switch to Live Log tab to see real-time output",
    "run.acc_status_col":         "Status",
    // New keys for hardcoded strings
    "run.accounts_subtitle":      (n, d) => `📅 ${d} · ${n} accounts`,
    "run.n_running":              (n) => `${n} running`,
    "run.bot_stopped_user":       "⏹ Bot stopped by user.",
    "run.all_bots_stopped":       "⏹ All bots stopped by user.",
    "run.bot_failed":             (e) => `❌ Bot failed: ${e}`,
    "run.notif_error_title":      "Taager Bot - Error",
    "run.notif_error_body":       (e) => e || "Bot failed. Check the log.",
    "run.orders_all_in_taager":     "All orders in this date range are already in Taager or were skipped.",
    "run.acc_label_default":      (n) => `Account ${n}`,
    "run.acc_done_banner":        (label) => `✅ Completed — ${label}`,
    "run.acc_failed_banner":      (label) => `❌ Failed — ${label}`,
    "run.preview_saved":          (path) => `✅ Preview saved: ${path}`,
    "run.preview_ready_log":      (label, n) => `📋 [${label}] ${n} orders ready — uploading now`,
    "run.log_new_orders":         (n) => `📊 New orders: ${n}`,
    "run.stat_real_scanned":      "Real Orders Scanned",
    "run.stat_missed_scanned":    "Missed Orders Scanned",
    "run.stat_already_taager":      "Already in Taager",
    "run.stat_duplicate_phones":  "Duplicate Phones",
    "results.toast_saved":        (path) => `✅ Saved to ${path}`,
    "results.accounts_count_label": (n) => `${n} account${n !== 1 ? "s" : ""}`,
    "results.all_accounts_sidebar": "All Accounts",
    "results.accounts_label":     "Accounts",
    "results.n_accounts_ok":      (total, ok) => `${total} accounts · ${ok} OK`,
    "setup.date_range_err":       "End date must be after the start date. Please fix the range.",
    "setup.date_before_start":    "⚠️ End date before start",
    "setup.add_new_account_title":"Add new account",
    "setup.admin_reset_title":    "Admin has granted a one-time reset. Click to clear all accounts and sessions.",
    "setup.locked_reset_title":   "Locked — contact admin to enable a reset from the admin panel.",
    "setup.account_fallback":     "Account",
    "ui.ok":                      "OK",
    "ui.cancel":                  "Cancel",
    "ui.dismiss":                 "Dismiss",
    "ui.retry":                   "Retry",
    "ui.loading":                 "Loading...",
    "ui.confirm_title":           "Are you sure?",
    "ui.toast_success":           "Done",
    "ui.toast_error":             "Something went wrong",
    "ui.toast_info":              "Updated",
    "ui.help":                    "Help",
    "dashboard.fetching_title":    "Updating dashboard...",
    "dashboard.fetching_body":     "Fetching orders, refreshing product data, and matching ad spend across accounts. This can take a few minutes; keep the app open.",
    "dashboard.initial_sync_title": "Syncing dashboard data...",
    "dashboard.initial_sync_body":  "Preparing saved orders, account metrics, product calculators, marketing spend, and AI context. Large workspaces can take a little while.",
    "dashboard.fetching_account":  "Updating {current} of {total}: {account}. Pulling orders, checking product rows, and matching ad spend.",
    "dashboard.fetching_2fa":      "Complete the EasyOrders verification code in the browser window. Dashboard Update will continue automatically.",
    "dashboard.fetch_success":     "Dashboard updated",
    "dashboard.fetch_success_body":"Fetched {count} orders across {total} account(s).",
    "dashboard.fetch_partial":     "Dashboard partially updated",
    "dashboard.fetch_partial_body":"Fetched {count} orders from {success} of {total} account(s). Failed: {failed}.",
    "dashboard.fetch_partial_clean_body":"Fetched {count} orders from {success} of {total} account(s).",
    "dashboard.fetch_error_title": "Dashboard update failed",
    "dashboard.fetch_error_body":  "Some accounts could not be updated. Try again, or open the dashboard to view the latest saved data.",
    "dashboard.fetch_retry":       "Try again",
    "dashboard.fetch_open":        "Open dashboard",
    "dashboard.fetch_empty_title": "No dashboard data fetched",
    "dashboard.fetch_empty_body":  "The selected accounts returned no orders. Check the account data or try another account.",
    // license page
    "license.title":              "License Required",
    "license.subtitle":           "Enter your license key to activate the app.",
    "license.key_label":          "License Key",
    "license.btn_activate":       "Activate License 🔐",
    "license.btn_verifying":      "Verifying...",
    "license.btn_activated":      "✅ Activated!",
    "license.btn_support":        "Contact Support",
    "license.err_empty":          "Please enter your license key.",
    "license.err_invalid":        "Invalid license key.",
    "license.days_remaining":     (d) => `${d} day(s) remaining`,
    "license.support_hint":       "Contact support if you need a license key.",
    "license.device_hint":        "If you see a \"different device\" error, contact support to reset the device lock.",
    "license.restore_title":      "Saved credentials found",
    "license.restore_body":       "Restore your saved Taager/EasyOrders credentials on this device. Orders and local reports stay local to each machine.",
    "license.restore_btn":        "Restore credentials",
    "license.restore_skip":       "Skip for now",
    "license.restore_working":    "Restoring...",
    "license.restore_done":       "Restored",
    "license.restore_failed":     "Could not restore saved credentials.",
    "setup.backup_prompt_title":   "Back up your saved accounts",
    "setup.backup_prompt_body":    "Create an encrypted backup of the accounts saved on this device so you can restore them on another approved device.",
    "setup.backup_prompt_btn":     "Back up now",
    "setup.backup_prompt_working": "Backing up...",
    "setup.backup_prompt_done":    "Encrypted backup saved.",
    "setup.backup_prompt_failed":  "Could not back up credentials. Try again.",
    "titlebar.copy_license":      "Copy License",
    "titlebar.copied":            "Copied!",
    // Expired overlay
    "expired.title":              "License Expired",
    "expired.subtitle":           (r) => r || "Your subscription has expired.",
    "expired.sub2":               "Please contact the administrator to renew your license. The app will unlock after the renewal is confirmed.",
    "expired.badge_expired":      "● Expired",
    "expired.badge_checking":     "● Checking…",
    "expired.badge_active":       "● Active",
    "expired.btn_continue":       "Renewal by admin only",
    "expired.btn_checking":       "Checking license…",
    "expired.btn_verified":       "✅ Verified — Resuming…",
    "expired.meta_license_id":    "License ID",
    "expired.meta_merchant_name": "Merchant Name",
    "expired.meta_last_valid":    "Last Validated",
    "expired.meta_remaining":     "Remaining Access",
    "expired.meta_expired":       "Expired",
    "expired.copy_license":       "Copy license ID",
    "expired.copied":             "License ID copied!",
    "expired.err_copy":           "Could not copy the license ID.",
    "expired.err_still":          (r) => r || "License is still expired. Please contact your administrator.",
    "expired.err_network":        "Could not reach the license server. Check your internet connection.",
    // License expiry warning
    "warning.kicker":             "Renewal reminder",
    "warning.title":              "Your license expires soon",
    "warning.body":               "Don't forget to renew your license to keep your work uninterrupted.",
    "warning.days_label":         "Days remaining",
    "warning.days_remaining":     (d) => d === 1 ? "day remaining" : "days remaining",
    "warning.license_label":      "License",
    "warning.contact":            "Contact Support to Renew",
    "warning.later":              "Not now",
    "warning.close":              "Close",
    // Calendar widget
    "calendar.months": ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    "calendar.days":   ["Su","Mo","Tu","We","Th","Fr","Sa"],
  },
  ar: {
    "titlebar.zoom_group": "تكبير وتصغير التطبيق",
    "titlebar.zoom_in": "تكبير العرض",
    "titlebar.zoom_out": "تصغير العرض",
    "titlebar.zoom_reset": "إعادة العرض إلى 100%",
    "topbar.welcome": (n) => n ? `أهلاً، ${n}` : "أهلاً",
    "topbar.days":    (d) => d != null ? `متبقي ${d} ${d === 1 ? "يوم" : "أيام"}` : "",
    "topbar.expires": "الترخيص ينتهي قريباً",
    "topbar.analytics":  "التحليلات",
    "topbar.operations": "العمليات",
    "topbar.run_results": "نتائج التشغيل",
    "topbar.dashboard":  "لوحة التحكم",
    "topbar.notifications": "التنبيهات",
    "titlebar.sync":     "مزامنة",
    "titlebar.sync_tooltip": "تحديث التطبيق بالكامل.",
    "titlebar.clear_cache": "\u062a\u0646\u0638\u064a\u0641 \u0627\u0644\u0643\u0627\u0634",
    "titlebar.clear_cache_tooltip": "\u062a\u0646\u0638\u064a\u0641 \u0627\u0644\u0643\u0627\u0634 \u0627\u0644\u0645\u062d\u0644\u064a \u0648\u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062a\u0637\u0628\u064a\u0642.",
    "titlebar.clear_cache_confirm": "\u0633\u064a\u062a\u0645 \u062a\u0646\u0638\u064a\u0641 \u0627\u0644\u0643\u0627\u0634 \u0627\u0644\u0645\u062d\u0644\u064a \u0648\u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062a\u0637\u0628\u064a\u0642 \u0641\u0642\u0637. \u0644\u0646 \u064a\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a \u0623\u0648 \u0627\u0644\u062a\u0631\u062e\u064a\u0635 \u0623\u0648 \u0627\u0644\u0637\u0644\u0628\u0627\u062a. \u0647\u0644 \u062a\u0631\u064a\u062f \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629\u061f",
    "titlebar.clearing_cache": "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u0646\u0638\u064a\u0641...",
    "titlebar.lang_tooltip": "التبديل بين العربية والإنجليزية.",
    "titlebar.theme_tooltip": "التبديل بين الوضع الفاتح والداكن.",
    "titlebar.minimize": "تصغير النافذة",
    "titlebar.maximize": "تكبير أو استعادة النافذة",
    "titlebar.close": "إغلاق Taager Bot",
    "preloader.workspace.title": "جارٍ تجهيز مساحة العمل...",
    "preloader.workspace.session": "جارٍ فحص الجلسة المحفوظة...",
    "preloader.workspace.settings": "جارٍ تحميل إعدادات التطبيق...",
    "preloader.workspace.ready": "جارٍ تجهيز مساحة العمل...",
    "preloader.dashboard.stage.engine.label": "محرك لوحة التحكم",
    "preloader.dashboard.stage.engine.body": "جارٍ تحميل كود لوحة التحكم والأنماط وأدوات التحكم.",
    "preloader.dashboard.stage.snapshot.label": "اللقطات المحفوظة",
    "preloader.dashboard.stage.snapshot.body": "جارٍ قراءة لقطات الحسابات المحفوظة على هذا الجهاز.",
    "preloader.dashboard.stage.accounts.label": "الحسابات",
    "preloader.dashboard.stage.accounts.body": "جارٍ مطابقة الحسابات والدول والعملات ونطاق التاريخ.",
    "preloader.dashboard.stage.metrics.label": "المؤشرات",
    "preloader.dashboard.stage.metrics.body": "جارٍ تجهيز الطلبات والإيرادات والأرباح وCOD وNDR.",
    "preloader.dashboard.stage.modules.label": "عروض لوحة التحكم",
    "preloader.dashboard.stage.modules.body": "جارٍ بناء عروض المنتجات والمدن والحملات والحاسبة والرؤى السريعة.",
    "preloader.dashboard.stage.marketing.label": "الإنفاق التسويقي",
    "preloader.dashboard.stage.marketing.body": "جارٍ فحص الإنفاق التسويقي المتصل للنطاق المحدد.",
    "preloader.dashboard.stage.rendering.label": "العرض",
    "preloader.dashboard.stage.rendering.body": "جارٍ عرض لوحة التحكم النهائية.",
    "preloader.dashboard.activity.starting": "جارٍ بدء لوحة التحكم...",
    "preloader.dashboard.activity.engineLoaded": "تم تحميل محرك لوحة التحكم",
    "preloader.dashboard.activity.snapshotPayload": "جارٍ تحميل بيانات اللقطة المحفوظة",
    "preloader.dashboard.activity.savedSnapshots": "جارٍ قراءة لقطات لوحة التحكم المحفوظة",
    "preloader.dashboard.activity.accountScope": "جارٍ مطابقة نطاق حسابات لوحة التحكم",
    "preloader.dashboard.activity.metrics": "جارٍ تجهيز مؤشرات لوحة التحكم",
    "preloader.dashboard.activity.views": "جارٍ بناء عروض لوحة التحكم",
    "preloader.dashboard.activity.viewsPrepared": "تم تجهيز عروض لوحة التحكم",
    "preloader.dashboard.activity.marketing": "جارٍ فحص الإنفاق التسويقي المتصل",
    "preloader.dashboard.activity.marketingSync": "جارٍ مزامنة الإنفاق التسويقي المتصل",
    "preloader.dashboard.activity.marketingCached": "جارٍ فحص حالة التسويق المحفوظة",
    "preloader.dashboard.activity.rendering": "جارٍ عرض لوحة التحكم النهائية",
    "preloader.dashboard.activity.ready": "لوحة التحكم جاهزة.",
    "preloader.dashboard.activity.bestData": "تم فتح لوحة التحكم بأفضل بيانات متاحة.",
    "preloader.dashboard.activity.metricsPrepared": "تم تجهيز مؤشرات لوحة التحكم",
    "preloader.dashboard.activity.emptyMetrics": "جارٍ تجهيز مؤشرات لوحة تحكم فارغة",
    "preloader.dashboard.activity.noSnapshot": "لا توجد لقطة حساب محفوظة بعد",
    "preloader.dashboard.activity.accountSnapshotsLoaded": (n) => `تم تحميل ${n} لقطات حساب`,
    "preloader.dashboard.activity.rowsSelected": (n) => `${n} صفوف في الفترة المحددة`,
    "preloader.dashboard.activity.ordersPrepared": (n) => `تم تجهيز ${n} طلبات`,
    "setup.nav_dashboard": "لوحة التحكم",
    "setup.update_dashboard_btn": "تحديث لوحة التحكم",
    "setup.title":        "أهلاً بك في Taager Bot",
    "setup.subtitle":     "أدخل بيانات الدخول مرة واحدة — يتم حفظها بشكل آمن على هذا الجهاز.",
    "setup.easy_section": "📦 حساب Easy-Orders",
    "setup.cms_section": "حساب CMS",
    "setup.cms_label": "CMS / مصدر الطلبات",
    "setup.cms_easyorders": "EasyOrders",
    "setup.cms_lightfunnels": "LightFunnels",
    "setup.lightfunnels_account_label": "اسم الحساب",
    "setup.lightfunnels_account_ph": "مثال: trendatsaudi",
    "setup.lightfunnels_login_method": "طريقة دخول LightFunnels",
    "setup.lightfunnels_login_email": "البريد وكلمة المرور",
    "setup.lightfunnels_login_google": "Google",
    "setup.lightfunnels_google_hint": "دخول Google سيفتح Chrome في مرحلة ربط LightFunnels.",
    "setup.lightfunnels_required_hint": "اسم حساب LightFunnels والبريد وكلمة المرور مطلوبة لهذا الحساب.",
    "setup.taager_section": "🛒 حساب تاجر",
    "setup.country_label": "الدولة",
    "setup.country_sa": "🇸🇦 السعودية (SA)",
    "setup.country_sa_only": "يدعم إعداد تاجر الحالي السعودية.",
    "setup.store_label":  "اسم المتجر",
    "setup.store_hint":   "(مطلوب)",
    "setup.store_ph":     "مثال: themnzl",
    "setup.missing_orders_store_label": "اسم متجر الطلبات المفقودة",
    "setup.missing_orders_store_ph": "أدخل اسم متجر الطلبات المفقودة في تاجر",
    "setup.missing_orders_store_hint": "يُستخدم داخل نافذة رفع الطلبات المفقودة في تاجر. مطلوب عند تفعيل توجيه الطلبات المفقودة.",
    "setup.missing_orders_store_no_accounts": "اختر حساب EasyOrders واحداً على الأقل لتحديد اسم متجر الطلبات المفقودة.",
    "setup.affiliate_recovery_label": "EasyOrders Affiliate Recovery",
    "setup.affiliate_recovery_hint": "When enabled, this feature resends missing EasyOrders real orders and converts missed orders, then verifies them from Taager exports.",
    "setup.email_label":  "البريد الإلكتروني",
    "setup.email_ph":     "you@example.com",
    "setup.pass_label":   "كلمة المرور",
    "setup.taager_email_ph":"affiliate@taager.com",
    "setup.taager_login_method": "طريقة دخول تاجر",
    "setup.taager_login_email": "البريد وكلمة المرور",
    "setup.taager_login_phone": "الهاتف وكلمة المرور",
    "setup.taager_login_google": "دخول Google",
    "setup.taager_google_hint": "دخول Google يفتح Chrome للتأكيد اليدوي. قفل الحساب يستخدم كود تاجر + الدولة.",
    "setup.taager_phone_label": "هاتف تاجر",
    "setup.taager_phone_ph": "5xxxxxxxx",
    "setup.save_btn":     "حفظ والمتابعة ←",
    "setup.dashboard_enrichment_label":        "مصدر بيانات لوحة التحكم",
    "setup.dashboard_enrichment_taager":        "Taager فقط",
    "setup.dashboard_enrichment_easyorders":    "Taager + EasyOrders",
    "setup.dashboard_enrichment_lightfunnels":  "Taager + LightFunnels",
    "setup.dashboard_enrichment_hint_taager":   "ستعتمد لوحة التحكم على Taager كمصدر وحيد للطلبات والأرباح وبيانات المنتجات. خيار بسيط وسريع — مناسب إذا لم تكن تستخدم EasyOrders.",
    "setup.dashboard_enrichment_hint_easyorders": "ستجلب لوحة التحكم الطلبات والأرباح من Taager، وتتصل أيضاً بـ EasyOrders لتحسين أسماء المنتجات وبيانات الدفع. الخيار الأمثل إذا كنت تستخدم المنصتين معاً.",
    "setup.dashboard_enrichment_hint_lightfunnels": "تم ربط هذا الحساب كمصدر LightFunnels. سيتم استخدامه في أتمتة لوحة التحكم في المرحلة التالية.",
    "setup.err_missing":  "<strong>حقول مفقودة</strong> — يجب ملء جميع الحقول المطلوبة.",
    "setup.err_locked":   "<strong>حساب مقفل</strong> — هذا الترخيص مرتبط بحسابات مختلفة. تواصل مع الدعم.",
    "welcome.app_title":      "Taager Bot",
    "welcome.app_subtitle":   "أتمتة معالجة طلباتك اليومية",
    "welcome.quick_start":    "ابدأ الآن",
    "welcome.today_btn":      (d) => `📅 متابعة — اليوم (${d})`,
    "welcome.new_date_btn":   "🗓️ تاريخ / نطاق جديد",
    "welcome.launch_min":     "🔕 تشغيل مصغّر",
    "welcome.launch_min_desc":"عند التفعيل، يبدأ التطبيق مخفياً في شريط المهام.",
    "welcome.autoconfirm_title": "🤖 تأكيد الطلبات تلقائياً",
    "welcome.autoconfirm_desc":  "عند التفعيل، يضغط البوت على تأكيد تلقائياً. أبقه معطلاً حتى تثق تماماً في المخرجات.",
    "welcome.missing_orders_title": "📥 توجيه الطلبات المفقودة",
    "welcome.missing_orders_desc":  "عند التفعيل، تُرفع الطلبات القادمة من مصدر الطلبات المفقودة في EasyOrders إلى قسم الطلبات المفقودة القديم في تاجر، بينما تظل الطلبات الحقيقية في العربة العادية. متاح لحسابات السعودية فقط.",
    "welcome.affiliate_recovery_title": "Affiliate Recovery",
    "welcome.affiliate_recovery_desc": "Resend missing EasyOrders real orders and convert missed orders, then verify them from Taager exports.",
    "welcome.autorun":        "⏱️ التشغيل التلقائي",
    "welcome.autorun_desc":   "تشغيل تلقائي لطلبات اليوم وفق جدول زمني.",
    "welcome.run_every":      "كل",
    "welcome.select_date":    "اختر التاريخ",
    "welcome.today":          "اليوم",
    "welcome.single_day":     "يوم واحد",
    "welcome.pick_one":       "اختر تاريخاً",
    "welcome.date_range":     "نطاق تواريخ",
    "welcome.from_to":        "من → إلى",
    "welcome.from":           "من",
    "welcome.to":             "إلى",
    "welcome.launch_btn":     "🚀 تشغيل البوت",
    "welcome.reset_section":  "⚠️ إعادة ضبط",
    "welcome.reset_notice":   "<strong>بيانات دخول جديدة؟</strong>سيتم حذف جميع البيانات والجلسات. ستحتاج إلى إدخال بيانات الدخول مجدداً.",
    "welcome.reset_btn":      "إعادة ضبط البيانات وبيانات الدخول",
    "welcome.reset_confirm_title":"إعادة ضبط البيانات؟",
    "welcome.reset_confirm_msg":  "سيتم حذف جميع بيانات الدخول المحفوظة والجلسات والكوكيز.",
    "welcome.reset_confirm_ok":   "إعادة الضبط",
    "welcome.reset_confirm_cancel":"إلغاء",
    "welcome.off":            "إيقاف",
    "welcome.on":             "تشغيل",
    "welcome.next_run":       (m, s) => `⏳ التشغيل التالي خلال ${m}:${s}`,
    "run.title":          "البوت يعمل",
    "run.starting":       "● جارٍ البدء...",
    "run.stop":           "⏹ إيقاف",
    "run.home":           "🏠 الرئيسية",
    "run.phase0":         "تسجيل دخول Easy-Orders",
    "run.phase1":         "تصدير الطلبات الفعلية",
    "run.phase2":         "تصدير الطلبات الفائتة",
    "run.phase3":         "تسجيل دخول تاجر وتصديره",
    "run.phase4":         "رفع الطلبات إلى تاجر",
    "run.waiting":        "في الانتظار...",
    "run.2fa_title":      "مطلوب التحقق الثنائي",
    "run.2fa_msg":        "أكمل التحقق في نافذة المتصفح ثم عد هنا.",
    "run.confirm_title":  "إجراء مطلوب — راجع الطلبات وأكدها",
    "run.confirm_msg":    "راجع في نافذة المتصفح ثم انقر <strong>تأكيد كل الطلبات</strong>. البوت ينتظر (حتى 10 دقائق).",
    "run.restart_title":  "فشل تصدير تاجر - إعادة المحاولة تلقائياً",
    "run.restart_wait":   "انتظر — إعادة المحاولة خلال",
    "run.ratelimit_title":"حد المعدل — انتظار...",
    "run.creating":       "📤 رفع الطلبات إلى تاجر",
    "run.live_log":       "السجل المباشر",
    "run.cooldown_label": "انتظار — حد معدل Easy-Orders",
    "run.cooldown_next":  "التشغيل التالي خلال",
    "run.preview_header": (n) => `📋 ${n} طلب جاهز — جارٍ الرفع`,
    "run.preview_cols":   ["المنتج", "الكمية", "السعر", "التاريخ", "المدينة", "الاسم", "الهاتف"],
    "run.progress_start": "جارٍ البدء...",
    "results.title":      (d) => `النتائج — ${d}`,
    "results.completed":  "اكتمل تشغيل البوت",
    "results.home":       "🏠 الرئيسية",
    "results.run_again":  "🔄 تشغيل مجدداً",
    "results.download":   "⬇️ تحميل Excel",
    "results.download_failed": "⬇️ تحميل الطلبات الفاشلة",
    "results.couldnt_process_btn": "تحذيرات / مستبعدة",
    "results.couldnt_process_title": (n) => `تحذيرات / مستبعدة — ${n} ${n === 1 ? "طلب" : "طلبات"}`,
    "results.skipped_followup": "راجع الطلبات المرفوعة بتحذير، وتابع الطلبات المستبعدة يدويًا",
    "results.warning_status_col": "النتيجة",
    "results.warning_uploaded": "تم الرفع مع تحذير",
    "results.warning_skipped": "مستبعد",
    "results.raw_phone_col": "الهاتف الأصلي",
    "results.normalized_phone_col": "الهاتف بعد التعديل",
    "results.source_col": "\u0627\u0644\u0645\u0635\u062f\u0631",
    "results.sku_product_col": "\u0643\u0648\u062f/\u0645\u0646\u062a\u062c",
    "results.message_col": "\u0627\u0644\u0631\u0633\u0627\u0644\u0629",
    "results.uncertain_orders_title": "\u0637\u0644\u0628\u0627\u062a \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629",
    "results.uncertain_orders_need_review": "{count} \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629",
    "results.reason_col": "السبب",
    "results.reason_phone_parse_failed": "رقم الهاتف غير صالح",
    "results.reason_phone_uncertain_zero_appended": "رقم الهاتف ناقص — تمت إضافة 0 في النهاية مع الحاجة للمراجعة",
    "results.reason_product_not_in_catalog": "المنتج غير موجود في شيت EasyOrders أو شيت Taager",
    "results.reason_product_not_in_easyorders_or_taager": "المنتج غير موجود في شيت EasyOrders أو شيت Taager",
    "results.reason_partial_order_already_in_taager": "\u0628\u0639\u0636 \u0645\u0646\u062a\u062c\u0627\u062a \u0627\u0644\u0637\u0644\u0628 \u0645\u0648\u062c\u0648\u062f\u0629 \u0641\u064a \u062a\u0627\u062c\u0631 - \u0631\u0627\u062c\u0639 \u0642\u0628\u0644 \u0625\u0646\u0634\u0627\u0621 \u0637\u0644\u0628 \u0634\u062d\u0646 \u062c\u062f\u064a\u062f",
    "results.reason_missing_sku_in_group": "\u0637\u0644\u0628 \u0645\u062c\u0645\u0639 \u064a\u062d\u062a\u0648\u064a \u0639\u0644\u0649 SKU \u0646\u0627\u0642\u0635",
    "results.reason_source_order_already_in_taager": "\u0646\u0641\u0633 \u0637\u0644\u0628 EasyOrders \u0645\u0648\u062c\u0648\u062f \u0628\u0627\u0644\u0641\u0639\u0644 \u0641\u064a \u062a\u0627\u062c\u0631",
    "results.reason_delivered_order_already_in_taager": "\u0637\u0644\u0628 \u0645\u0648\u0635\u0644 \u0645\u0648\u062c\u0648\u062f \u0628\u0646\u0641\u0633 \u0627\u0644\u0647\u0627\u062a\u0641 \u0648SKU \u0648\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0646\u0634\u0627\u0621",
    "results.reason_delivered_repeat_needs_identity": "\u064a\u0648\u062c\u062f \u062a\u0627\u0631\u064a\u062e \u062a\u0648\u0635\u064a\u0644\u060c \u0644\u0643\u0646 \u0643\u0648\u062f \u0627\u0644\u0637\u0644\u0628 \u0623\u0648 \u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0644\u0627 \u064a\u062b\u0628\u062a \u0623\u0646\u0647 \u0637\u0644\u0628 \u062c\u062f\u064a\u062f",
    "results.reason_no_trusted_product_reference": "\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u0631\u062c\u0639 \u0645\u0648\u062b\u0648\u0642 \u0644\u0644\u0645\u0646\u062a\u062c",
    "results.reason_normal_flow_prepared_quantity_is_suspicious": "\u0643\u0645\u064a\u0629 \u0645\u0634\u0643\u0648\u0643 \u0641\u064a\u0647\u0627 \u0645\u0646 \u062a\u062d\u0636\u064a\u0631 \u0627\u0644\u0637\u0644\u0628",
    "results.reason_duplicate_easyorders_uuid_conflicting_phone": "\u0646\u0641\u0633 \u0637\u0644\u0628 EasyOrders \u0644\u0647 \u0623\u0631\u0642\u0627\u0645 \u0647\u0627\u062a\u0641 \u0645\u062a\u0639\u0627\u0631\u0636\u0629",
    "results.reason_skipped_manual": "\u0645\u0631\u0627\u062c\u0639\u0629 \u064a\u062f\u0648\u064a\u0629",
    "results.message_no_trusted_product_reference": "\u0644\u0627 \u064a\u0648\u062c\u062f \u062a\u0627\u0631\u064a\u062e \u0645\u0648\u062b\u0648\u0642 \u0644\u0644\u0645\u0646\u062a\u062c\u061b \u0644\u0645 \u064a\u062a\u0645 \u0625\u0631\u0633\u0627\u0644\u0647 \u062a\u0644\u0642\u0627\u0626\u064a\u0627.",
    "results.confirmed_orders_table": "\u0637\u0644\u0628\u0627\u062a \u062c\u062f\u064a\u062f\u0629 \u0645\u0624\u0643\u062f\u0629 \u0641\u064a \u062a\u0627\u062c\u0631",
    "results.phone_rescued_verify": "تم تعديل الهاتف بإضافة 0 في النهاية — راجعه قبل الاتصال",
    "results.new_orders": "طلبات جديدة",
    "results.in_taager":    "موجودة في تاجر",
    "results.dupes":      "مكررات محذوفة",
    "results.failed":     "فشلت في تاجر",
    "results.all_caught": "!أنجزت كل شيء",
    "results.no_orders":  "لا طلبات جديدة في هذا النطاق الزمني.",
    "results.from_real":  "من الطلبات الفعلية",
    "results.from_missed":"من الطلبات الفائتة",
    "results.new_unique": "طلبات جديدة فريدة",
    "results.by_product": "📦 الطلبات حسب المنتج",
    "results.no_product": "لا بيانات منتجات متاحة.",
    "results.product":    "اسم المنتج",
    "results.orders":     "الطلبات",
    "results.total_qty":  "الكمية الكلية",
    "results.total":      "المجموع",
    "results.fail_title": (n) => `${n} طلب فشل - رُفض من تاجر`,
    "results.product_count": (n) => n === 1 ? "طلب" : "طلبات",
    "results.fail_saved": "تم الحفظ على جهازك. افتح المجلد للتفاصيل.",
    "results.failed_table_hint": "معاينة مختصرة. مرّر على أي خلية مختصرة لعرض اسم المنتج أو الخطأ كاملًا.",
    "results.open_folder":"📁 فتح المجلد",
    "results.all_ok":     "<strong>تم رفع وتأكيد جميع الطلبات</strong> لا طلبات فاشلة في هذه الجولة.",
    "results.row":        "الصف",
    "results.sku":        "الكود",
    "results.phone":      "الهاتف",
    "results.error":      "الخطأ",
    // setup page — accounts step
    "setup.nav_accounts":       "الحسابات",
    "setup.nav_analytics":      "التحليلات",
    "setup.nav_operations":     "العمليات",
    "setup.nav_run_results":    "نتائج التشغيل",
    "setup.nav_notifications":  "التنبيهات",
    "setup.nav_run":            "التشغيل",
    "setup.sub_title":          "الإعداد",
    "setup.reset_creds_btn":    "إعادة تعيين بيانات الدخول",
    "setup.check_updates_btn":  "\u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u062a\u062d\u062f\u064a\u062b\u0627\u062a",
    "setup.report_issue_btn":  "\u0627\u0644\u0625\u0628\u0644\u0627\u063a \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",
    "setup.app_version":        (v) => `\u0625\u0635\u062f\u0627\u0631 \u0627\u0644\u062a\u0637\u0628\u064a\u0642 \u0647\u0648 v${v}`,
    "setup.checking_updates":   "\u{23F3} \u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0642\u0642...",
    "update.btn_title_checking": "\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u062a\u062d\u062f\u064a\u062b\u0627\u062a...",
    "update.btn_title_check":    "\u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u062a\u062d\u062f\u064a\u062b\u0627\u062a",
    "update.downloading_action": "\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0645\u064a\u0644...",
    "update.dev_title":          "\u0648\u0636\u0639 \u0627\u0644\u062a\u0637\u0648\u064a\u0631",
    "update.dev_sub":            "\u0627\u0644\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a \u064a\u0639\u0645\u0644 \u0641\u0642\u0637 \u0641\u064a \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0645\u062b\u0628\u062a\u0629.",
    "update.ok":                 "\u062d\u0633\u0646\u0627\u064b",
    "update.check_failed_title": "\u0641\u0634\u0644 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u062a\u062d\u062f\u064a\u062b",
    "update.unknown_error":      "\u062e\u0637\u0623 \u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641",
    "update.dismiss":            "\u0625\u063a\u0644\u0627\u0642",
    "update.available_title":    (v) => `\u062a\u062d\u062f\u064a\u062b v${v} \u0645\u062a\u0627\u062d`,
    "update.available_sub":      "\u064a\u0648\u062c\u062f \u0625\u0635\u062f\u0627\u0631 \u062c\u062f\u064a\u062f \u062c\u0627\u0647\u0632 \u0644\u0644\u062a\u062d\u0645\u064a\u0644.",
    "update.download_update":    "\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u062a\u062d\u062f\u064a\u062b",
    "update.up_to_date_title":   "\u0623\u0646\u062a \u0639\u0644\u0649 \u0622\u062e\u0631 \u0625\u0635\u062f\u0627\u0631",
    "update.up_to_date_sub":     "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0625\u0635\u062f\u0627\u0631 \u062c\u062f\u064a\u062f.",
    "update.downloading_title":  "\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u062a\u062d\u062f\u064a\u062b...",
    "update.download_progress":  (p) => `${p}% \u0645\u0643\u062a\u0645\u0644`,
    "update.ready_title":        "\u0627\u0644\u062a\u062d\u062f\u064a\u062b \u062c\u0627\u0647\u0632 \u0644\u0644\u062a\u062b\u0628\u064a\u062a",
    "update.ready_sub":          "\u0623\u0639\u062f \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062a\u0637\u0628\u064a\u0642 \u0644\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u062a\u062d\u062f\u064a\u062b.",
    "update.restart_install":    "\u{1F680} \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0634\u063a\u064a\u0644 \u0648\u0627\u0644\u062a\u062b\u0628\u064a\u062a",
    "update.error_title":        "\u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u062a\u062d\u062f\u064a\u062b",
    "update.error_sub":          "\u062d\u062f\u062b \u062e\u0637\u0623 \u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062a\u062d\u062f\u064a\u062b.",
    "setup.manage_title":       "إدارة الحسابات",
    "setup.manage_sub":         "أضف، عدّل، أو احذف حساباتك. يتم اختيار الحسابات في الخطوة التالية.",
    "setup.your_accounts":      "حساباتك",
    "setup.your_accounts_desc": "إدارة الحسابات المتاحة لتشغيل المهام.",
    "setup.add_account":        "إضافة حساب",
    "setup.next_btn":           "التالي: إعداد التشغيل ←",
    "setup.account_type":       "\u0646\u0648\u0639 \u0627\u0644\u062d\u0633\u0627\u0628",
    "setup.normal_account":     "\u062d\u0633\u0627\u0628 \u0639\u0627\u062f\u064a",
    "setup.static_account":     "\u062d\u0633\u0627\u0628 \u062b\u0627\u0628\u062a",
    "setup.static_badge":       "\u062b\u0627\u0628\u062a",
    "setup.static_name":        "\u0627\u0633\u0645 \u0627\u0644\u062d\u0633\u0627\u0628",
    "setup.static_name_placeholder": "\u0645\u062b\u0627\u0644: Jake",
    "setup.static_name_required": "\u0627\u0633\u0645 \u0627\u0644\u062d\u0633\u0627\u0628 \u0645\u0637\u0644\u0648\u0628.",
    "setup.static_hint":        "\u064a\u0633\u062a\u062e\u062f\u0645 \u0647\u0630\u0627 \u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u062b\u0627\u0628\u062a \u0628\u0645\u0644\u0641 Excel \u0648\u0644\u0627 \u064a\u062a\u0635\u0644 \u0628\u062a\u0627\u062c\u0631 \u0623\u0648 EasyOrders \u0623\u0648 LightFunnels.",
    "setup.continue_date":      "\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0644\u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u062a\u0627\u0631\u064a\u062e",
    "setup.run_title":          "تنفيذ التشغيل",
    "setup.run_sub":            "اختر المستخدمين وحدد التاريخ ثم ابدأ.",
    "setup.select_users":       "اختر المستخدمين",
    "setup.select_users_desc":  "اختر مستخدماً واحداً أو أكثر لتشغيل المهمة.",
    "setup.all_users":          "جميع المستخدمين",
    "setup.select_all":         "تحديد الكل",
    "setup.select_date":        "اختر التاريخ",
    "setup.select_date_desc":   "حدد موعد تشغيل المهمة.",
    "setup.today_mode":         "📅 اليوم",
    "setup.single_mode":        "🗓️ يوم واحد",
    "setup.range_mode":         "📆 نطاق",
    "setup.summary":            "الملخص",
    "setup.summary_desc":       "راجع اختياراتك قبل التشغيل.",
    "setup.users_selected":     "المستخدمون المحددون",
    "setup.date_range":         "نطاق التاريخ",
    "setup.total_days":         "إجمالي الأيام",
    "setup.back_btn":           "→ رجوع",
    "setup.run_btn":            "🚀 تنفيذ التشغيل",
    "setup.run_security":       "🔒 سيتم تنفيذ هذا الإجراء للمستخدمين المحددين ونطاق التاريخ.",
    "setup.select_user_to_launch":"اختر مستخدماً واحداً على الأقل للبدء.",
    "setup.date_label":         "التاريخ",
    "setup.start_date":         "تاريخ البداية",
    "setup.end_date":           "تاريخ النهاية",
    "setup.today_running":      (d) => `✅ المحدد: اليوم - ${d}`,
    "setup.locked":             "مقفل",
    "setup.unlocked":           "مفتوح",
    "setup.active":             "نشط",
    "setup.edit_btn":           "✏️ تعديل",
    "setup.delete_btn":         "حذف",
    "setup.edit_account":       "تعديل الحساب",
    "setup.add_member_name":     "\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0627\u0633\u0645",
    "setup.edit_member_name":    "\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0627\u0633\u0645",
    "setup.member_name_title":   "\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0627\u0633\u0645",
    "setup.member_name_subtitle":"\u063a\u064a\u0631 \u0627\u0633\u0645 \u0647\u0630\u0627 \u0627\u0644\u062d\u0633\u0627\u0628 \u0644\u0641\u0631\u064a\u0642\u0643. \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0646 \u062a\u062a\u063a\u064a\u0631.",
    "setup.member_name_label":   "\u0627\u0644\u0627\u0633\u0645",
    "setup.member_name_ph":      "\u0645\u062b\u0627\u0644: \u0623\u062d\u0645\u062f - \u0641\u0631\u064a\u0642 \u0627\u0644\u0631\u064a\u0627\u0636",
    "setup.member_name_hint":    "\u064a\u0638\u0647\u0631 \u0647\u0630\u0627 \u0627\u0644\u0627\u0633\u0645 \u0623\u0648\u0644\u0627\u064b \u0641\u064a \u0627\u0644\u062a\u0637\u0628\u064a\u0642. \u0625\u0630\u0627 \u062a\u0631\u0643\u062a\u0647 \u0641\u0627\u0631\u063a\u0627\u064b\u060c \u0633\u064a\u0638\u0647\u0631 \u0627\u0644\u0628\u0631\u064a\u062f \u0628\u062f\u0644\u0627\u064b \u0645\u0646\u0647.",
    "setup.clear_member_name":   "\u0645\u0633\u062d",
    "setup.save_member_name":    "\u062d\u0641\u0638 \u0627\u0644\u0627\u0633\u0645",
    "setup.new_account":        "حساب جديد",
    "setup.form_subtitle":      "أدخل بيانات الاعتماد لهذا الحساب.",
    "setup.keep_pass":          "اتركه فارغاً للإبقاء على كلمة المرور الحالية",
    "setup.cancel_btn":         "إلغاء",
    "setup.save_btn2":          "💾 حفظ",
    "setup.add_btn":            "➕ إضافة حساب",
    "setup.saving":             "جارٍ الحفظ...",
    "setup.limit_reached":      "تم الوصول لحد الترخيص — لا يمكن إضافة المزيد من الحسابات.",
    "setup.save_failed":        "فشل الحفظ.",
    "setup.remove_confirm":     "حذف هذا الحساب؟",
    "setup.reset_confirm_title":"إعادة ضبط جميع البيانات؟",
    "setup.reset_confirm_msg":  "سيتم حذف جميع بيانات الدخول المحفوظة والجلسات والكوكيز. ستحتاج إلى إعادة إدخال بيانات الدخول.",
    "setup.reset_confirm_ok":   "إعادة ضبط الكل",
    "setup.reset_confirm_cancel":"إلغاء",
    "setup.locked_title":       "مقفل من المشرف — تواصل مع الدعم لإعادة الضبط",
    "setup.license_one":        "الترخيص: حساب واحد فقط",
    "setup.license_max":        (n) => `الحد الأقصى ${n} حسابات`,
    "setup.users_count":        (n) => `${n} ${n === 1 ? "مستخدم" : "مستخدمين"}`,
    "setup.accounts_count":     (n) => `${n} ${n === 1 ? "حساب" : "حسابات"}`,
    "setup.days_count":         (n) => `${n} ${n === 1 ? "يوم" : "أيام"}`,
    // run page extra
    "run.phase_complete":  "اكتمل ✓",
    "run.phase_running":   "جارٍ...",
    "run.stop_title":      "إيقاف البوت؟",
    "run.stop_msg":        "سيتم إنهاء التشغيل الحالي فوراً. أي طلبات لم يتم رفعها بعد ستُفقد.",
    "run.stop_cancel":     "إلغاء",
    "run.stop_confirm":    "إيقاف البوت",
    // previously hardcoded strings — now translated
    "setup.taager_pass_hint":       "اتركه فارغاً للإبقاء على كلمة المرور الحالية",
    "results.run_failed":         "فشل تشغيل البوت",
    "results.error_occurred":     "حدث خطأ. راجع السجل للتفاصيل.",
    "results.internet_issue":     "\u0645\u0634\u0643\u0644\u0629 \u0627\u062a\u0635\u0627\u0644 \u0628\u0627\u0644\u0625\u0646\u062a\u0631\u0646\u062a \u0623\u0648 \u0627\u0646\u062a\u0647\u0627\u0621 \u0645\u0647\u0644\u0629 \u0627\u0644\u0645\u0648\u0642\u0639. \u0627\u0644\u0628\u0648\u062a \u064a\u0639\u064a\u062f \u0645\u062d\u0627\u0648\u0644\u0629 \u0635\u0641\u062d\u0627\u062a EasyOrders \u0627\u0644\u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u061b \u0625\u0630\u0627 \u062a\u0648\u0642\u0641 \u0627\u0644\u062a\u0634\u063a\u064a\u0644 \u0641\u0631\u0627\u062c\u0639 \u0627\u0644\u0625\u0646\u062a\u0631\u0646\u062a \u0648\u0634\u063a\u0644\u0647 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    "results.multi_all_ok":       "اكتملت جميع الحسابات بنجاح.",
    "results.multi_some_errors":  "بعض الحسابات واجهت أخطاء. اختر حساباً من القائمة لرؤية التفاصيل والتنزيل.",
    "run.all_accounts":           "🌐 جميع الحسابات",
    "results.all_accounts":       "🌐 جميع الحسابات — نظرة عامة",
    "results.per_account_summary":"📊 ملخص لكل حساب",
    // welcome page account selector
    "welcome.select_accounts":    "اختر الحسابات",
    "welcome.acc_selected":       (n) => `${n} محدد`,
    "welcome.parallel_hint":      "تحديد عدة حسابات سيشغّلها بالتوازي، كل حساب في نافذة Chrome منفصلة.",
    // run page badge / log strings
    "run.badge_running":          "● جارٍ التشغيل",
    "run.badge_stopped":          "⏹ متوقف",
    "run.badge_done":             "✅ اكتمل",
    "run.badge_all_done":         "✅ اكتمل الكل",
    "run.badge_done_errors":      "⚠️ اكتمل مع أخطاء",
    "run.badge_failed":           "❌ فشل",
    "run.badge_license_expired":  "🔒 انتهت صلاحية الترخيص",
    "run.badge_awaiting":         "👀 في انتظار التأكيد",
    "run.badge_cooldown":         "⏸️ انتظار",
    "run.badge_restarting":       "🔄 إعادة المحاولة...",
    "run.badge_uploading":        (c, tot) => `📤 رفع ${c}/${tot}`,
    "run.badge_uploading_short":  "📤 جارٍ الرفع",
    "run.badge_action_required":  "👀 إجراء مطلوب",
    "run.orders_ready":           "الطلبات جاهزة",
    "run.log_starting":           "🚀 جارٍ تشغيل البوت...",
    "run.log_date_range":         (f, to) => `📅 نطاق التاريخ: ${f} → ${to}`,
    "run.log_completed":          "✅ اكتمل تشغيل البوت بنجاح!",
    "run.log_license_expired":    "🔒 انتهت صلاحية الترخيص. يرجى إدخال ترخيص هذا الشهر.",
    "run.log_license_expired_short": "🔒 انتهت صلاحية الترخيص.",
    "run.notif_action_title":     "Taager Bot - إجراء مطلوب",
    "run.notif_action_body":      "يرجى مراجعة وتأكيد الطلبات في نافذة المتصفح.",
    "run.notif_2fa_title":        (tag) => `مطلوب التحقق الثنائي${tag}`,
    "run.notif_2fa_body":         "راجع نافذة المتصفح.",
    "run.notif_confirm_title":    (tag) => `إجراء مطلوب${tag}`,
    "run.notif_confirm_body":     "أكّد الطلبات في المتصفح.",
    "run.cooldown_attempt":       (a, m, s) => `المحاولة ${a}/${m} — انتظار ${s}ث قبل إعادة المحاولة.`,
    "run.restart_reason":         (r) => `السبب: ${r}`,
    "run.restart_attempt":        (a, m) => `المحاولة ${a}/${m}`,
    "run.all_phases_done":        "اكتملت جميع المراحل",
    "run.all_accounts_label":     "جميع الحسابات",
    "run.showing_label":          "يُعرض:",
    "run.phase_status_n":         (n) => `🔄 المرحلة ${n}`,
    "run.phase_status_active":    "🔄 جارٍ التشغيل",
    "run.click_to_copy":          "انقر على أي خلية للنسخ",
    "run.click_cells_copy":       "انقر للنسخ",
    "run.download":               "تحميل",
    "run.search_orders_placeholder": "\u0627\u0628\u062d\u062b \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0647\u0627\u062a\u0641 \u0623\u0648 \u0627\u0644\u0645\u0646\u062a\u062c...",
    "run.upload_placeholder":     "سيظهر تقدم الرفع وجدول الطلبات هنا",
    "run.no_new_orders_found":    "لا توجد طلبات جديدة",
    // results page strings
    "results.unknown":            "غير معروف",
    "results.no_product_data":    "لا بيانات منتجات",
    "results.no_error_info":      "لا تفاصيل أخطاء متاحة.",
    "results.search_orders_placeholder": "\u0627\u0628\u062d\u062b \u0628\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064a\u0644 \u0623\u0648 \u0627\u0644\u0647\u0627\u062a\u0641 \u0623\u0648 \u0627\u0644\u0645\u0646\u062a\u062c \u0623\u0648 \u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0623\u0648 \u0627\u0644\u0645\u062f\u064a\u0646\u0629...",
    "results.no_orders_found":    "\u0644\u0627 \u062a\u0648\u062c\u062f \u0637\u0644\u0628\u0627\u062a \u062a\u0637\u0627\u0628\u0642 \u0627\u0644\u0628\u062d\u062b.",
    "results.product_col":        "المنتج",
    "results.customer_name_col":  "اسم العميل",
    "results.phone_col":          "الهاتف",
    "results.qty_col":            "الكمية",
    "results.price_col":          "السعر",
    "results.easy_created_at_col": "\\u062A\\u0627\\u0631\\u064A\\u062E EasyOrders",
    "results.city_col":           "المدينة",
    "results.orders_col":         "الطلبات",
    "results.total_qty_col":      "إجمالي الكمية",
    "results.account_col":        "الحساب",
    "results.status_col":         "الحالة",
    "results.destination_col":     "الوجهة",
    "results.destination_cart":    "العربة",
    "results.destination_missing": "الطلبات المفقودة",
    "results.row_col":            "الصف",
    "results.error_col":          "الخطأ",
    "results.ok_status":          "ناجح",
    "results.error_status":       "خطأ",
    "results.all_orders_label":   "كل الطلبات",
    "results.all_uploaded":       "جميع الطلبات المرفوعة",
    "results.all_uploaded_all":   "جميع الطلبات المرفوعة — كل الحسابات",
    "results.all_attempted":      "All Attempted Orders",
    "results.all_attempted_all":  "All Attempted Orders - All Accounts",
    "results.upload_success_rate":"نسبة نجاح الرفع",
    "results.overall_success_rate":"النسبة الإجمالية للنجاح",
    "results.orders_by_product":  "الطلبات حسب المنتج",
    "results.order_sources":      "مصادر الطلبات",
    "results.uploaded_orders_title": "الطلبات المرفوعة",
    "results.uploaded_or_submitted_orders_title": "طلبات مرفوعة / مرسلة",
    "results.new_or_submitted_orders": "طلبات جديدة / مرسلة",
    "results.submission_success_rate": "نسبة نجاح الإرسال",
    "results.confirmed_plus_missing": (confirmed, missing) => `${confirmed} مؤكدة في سلة تاجر + ${missing} مرسلة إلى Missing Orders`,
    "results.missing_orders_pending_title": "طلبات Missing Orders مرسلة وليست مؤكدة كسلة عادية",
    "results.missing_orders_pending_body": "تاجر قبل ملف Missing Orders، لكن هذه الطلبات قد لا تظهر فورًا في قائمة طلبات تاجر العادية. راجع تبويب Missing Orders، أو وجّه الطلبات الفائتة إلى السلة/السلة الثانية عندما تحتاج تأكيدًا كطلبات عادية.",
    "results.affiliate_recovery_title": "EasyOrders Affiliate Recovery",
    "results.affiliate_recovery_verified": "Verified in Taager",
    "results.affiliate_recovery_failed": "Found in Taager failed orders",
    "results.affiliate_recovery_unresolved": "Not found after retry",
    "results.affiliate_recovery_sent_as_is": "Sent as-is",
    "results.affiliate_recovery_skipped": "Skipped",
    "results.all_products_combined":"جميع المنتجات — مجمّعة",
    "results.failed_uploads_total":"إجمالي فشل الرفع",
    "results.all_uploaded_ok":    "تم رفع الكل بنجاح",
    "results.already_in_system":  "موجودة في النظام",
    "results.duplicate_phone":    "رقم هاتف ومنتج مكرر",
    "results.confirmed_in_taager_cart": "مؤكدة في سلة تاجر",
    "results.sent_to_easy":       "طلبات أُرسلت إلى Easy-Orders",
    "results.failed_uploads":     "رفع فاشل",
    "results.all_ok_short":       "كل شيء صحيح",
    "results.orders_failed_upload":"طلبات فشل رفعها",
    "results.all_orders_ok":      "تم رفع جميع الطلبات بنجاح",
    "results.succeeded":          (n) => `✅ ${n} نجح`,
    "results.total_attempted":    (n) => `${n} محاولة`,
    "results.already_in_taager_n":  (n) => `+${n} موجودة في تاجر`,
    "results.across_accounts":    "عبر جميع الحسابات",
    "results.products_click":     (n) => `${n} منتج · انقر للنسخ`,
    "results.accounts_click":     (n) => `${n} حسابات · انقر للتفاصيل`,
    "results.orders_count":       (n) => `(${n} طلب)`,
    "results.select_acc_sidebar": "اختر حساباً من الشريط الجانبي لعرض تفاصيله",
    "results.uploading_detail":   (c, tot, s, f) => `📤 رفع: ${c}/${tot} · ✅${s} ❌${f}`,
    // setup page cancel button
    "setup.cancel_btn":           "إلغاء",
    "run.tab_status":             "⚙️ الحالة والتقدم",
    "run.tab_log":                "📋 السجل المباشر",
    "run.phases_header":          "⚙️ المراحل",
    "run.waiting_upload":         "في انتظار بيانات الرفع…",
    "run.switch_live_log":        "انتقل إلى تبويب السجل المباشر لرؤية المخرجات",
    "run.click_account_card":     "انقر على أي بطاقة حساب لعرض تفاصيله، أو انتقل إلى تبويب السجل المباشر",
    "run.acc_status_col":         "الحالة",
    // New keys for hardcoded strings
    "run.accounts_subtitle":      (n, d) => `📅 ${d} · ${n} حسابات`,
    "run.n_running":              (n) => `${n} جارٍ`,
    "run.bot_stopped_user":       "⏹ تم إيقاف البوت من قِبل المستخدم.",
    "run.all_bots_stopped":       "⏹ تم إيقاف جميع البوتات من قِبل المستخدم.",
    "run.bot_failed":             (e) => `❌ فشل البوت: ${e}`,
    "run.notif_error_title":      "Taager Bot - خطأ",
    "run.notif_error_body":       (e) => e || "فشل البوت. راجع السجل.",
    "run.orders_all_in_taager":     "جميع الطلبات في هذا النطاق موجودة بالفعل في تاجر أو تم تخطيها.",
    "run.acc_label_default":      (n) => `حساب ${n}`,
    "run.acc_done_banner":        (label) => `✅ اكتمل — ${label}`,
    "run.acc_failed_banner":      (label) => `❌ فشل — ${label}`,
    "run.preview_saved":          (path) => `✅ تم حفظ المعاينة: ${path}`,
    "run.preview_ready_log":      (label, n) => `📋 [${label}] ${n} طلب جاهز — جارٍ الرفع`,
    "run.log_new_orders":         (n) => `📊 طلبات جديدة: ${n}`,
    "run.stat_real_scanned":      "الطلبات الفعلية المُفحوصة",
    "run.stat_missed_scanned":    "الطلبات الفائتة المُفحوصة",
    "run.stat_already_taager":      "موجودة في تاجر",
    "run.stat_duplicate_phones":  "أرقام هاتف مكررة",
    "results.toast_saved":        (path) => `✅ تم الحفظ في ${path}`,
    "results.accounts_count_label": (n) => `${n} ${n === 1 ? "حساب" : "حسابات"}`,
    "results.all_accounts_sidebar": "جميع الحسابات",
    "results.accounts_label":     "الحسابات",
    "results.n_accounts_ok":      (total, ok) => `${total} حسابات · ${ok} ناجح`,
    "setup.date_range_err":       "يجب أن يكون تاريخ الانتهاء بعد تاريخ البداية. يرجى تصحيح النطاق.",
    "setup.date_before_start":    "⚠️ تاريخ الانتهاء قبل البداية",
    "setup.add_new_account_title":"إضافة حساب جديد",
    "setup.admin_reset_title":    "منح المشرف إعادة ضبط لمرة واحدة. انقر لمسح جميع الحسابات والجلسات.",
    "setup.locked_reset_title":   "مقفل — تواصل مع المشرف لتفعيل إعادة الضبط.",
    "setup.account_fallback":     "حساب",
    "ui.ok":                      "حسنا",
    "ui.cancel":                  "إلغاء",
    "ui.dismiss":                 "إغلاق",
    "ui.retry":                   "إعادة المحاولة",
    "ui.loading":                 "جاري التحميل...",
    "ui.confirm_title":           "هل أنت متأكد؟",
    "ui.toast_success":           "تم",
    "ui.toast_error":             "حدث خطأ",
    "ui.toast_info":              "تم التحديث",
    "ui.help":                    "مساعدة",
    "dashboard.fetching_title":    "جاري تحديث لوحة التحكم...",
    "dashboard.fetching_body":     "يتم جلب بيانات تاجر الحية. قد يستغرق ذلك بضع دقائق. اترك التطبيق مفتوحا.",
    "dashboard.initial_sync_title": "جاري مزامنة بيانات لوحة التحكم...",
    "dashboard.initial_sync_body":  "تحميل الطلبات وإنفاق تيك توك والحاسبات وإشارات الذكاء.",
    "dashboard.fetching_account":  "تحديث {current} من {total}: {account}",
    "dashboard.fetching_2fa":      "أكمل رمز التحقق لإيزي أوردرز في نافذة المتصفح. سيستكمل تحديث لوحة التحكم تلقائيا.",
    "dashboard.fetch_success":     "تم تحديث لوحة التحكم",
    "dashboard.fetch_success_body":"تم جلب {count} طلب عبر {total} حساب.",
    "dashboard.fetch_partial":     "تم تحديث لوحة التحكم جزئيا",
    "dashboard.fetch_partial_body":"تم جلب {count} طلب من {success} من أصل {total} حساب. فشل: {failed}.",
    "dashboard.fetch_partial_clean_body":"تم جلب {count} طلب من {success} من أصل {total} حساب.",
    "dashboard.fetch_error_title": "فشل تحديث لوحة التحكم",
    "dashboard.fetch_error_body":  "تعذر تحديث بعض الحسابات. حاول مرة أخرى، أو افتح لوحة التحكم لعرض آخر بيانات محفوظة.",
    "dashboard.fetch_retry":       "حاول مرة أخرى",
    "dashboard.fetch_open":        "افتح لوحة التحكم",
    "dashboard.fetch_empty_title": "لم يتم جلب بيانات للوحة التحكم",
    "dashboard.fetch_empty_body":  "الحسابات المحددة لم ترجع أي طلبات. تحقق من بيانات الحساب أو جرب حسابا آخر.",
    // license page
    "license.title":              "مطلوب الترخيص",
    "license.subtitle":           "أدخل مفتاح الترخيص لتفعيل التطبيق.",
    "license.key_label":          "مفتاح الترخيص",
    "license.btn_activate":       "تفعيل الترخيص 🔐",
    "license.btn_verifying":      "جارٍ التحقق...",
    "license.btn_activated":      "✅ تم التفعيل!",
    "license.err_empty":          "يرجى إدخال مفتاح الترخيص.",
    "license.err_invalid":        "مفتاح الترخيص غير صالح.",
    "license.days_remaining":     (d) => `متبقي ${d} يوم`,
    "license.support_hint":       "تواصل مع الدعم إذا كنت بحاجة إلى مفتاح ترخيص.",
    "license.device_hint":        "إذا ظهر خطأ \"جهاز مختلف\"، تواصل مع الدعم لإعادة ضبط قفل الجهاز.",
    "license.restore_title":      "Saved credentials found",
    "license.restore_body":       "Restore your saved Taager/EasyOrders credentials on this device. Orders and local reports stay local to each machine.",
    "license.restore_btn":        "Restore credentials",
    "license.restore_skip":       "Skip for now",
    "license.restore_working":    "Restoring...",
    "license.restore_done":       "Restored",
    "license.restore_failed":     "Could not restore saved credentials.",
    "setup.backup_prompt_title":   "نسخ الحسابات المحفوظة احتياطيا",
    "setup.backup_prompt_body":    "أنشئ نسخة احتياطية مشفرة للحسابات المحفوظة على هذا الجهاز حتى تستطيع استعادتها على جهاز آخر معتمد.",
    "setup.backup_prompt_btn":     "نسخ احتياطي الآن",
    "setup.backup_prompt_working": "جار النسخ...",
    "setup.backup_prompt_done":    "تم حفظ النسخة الاحتياطية المشفرة.",
    "setup.backup_prompt_failed":  "تعذر نسخ بيانات الدخول احتياطيا. حاول مرة أخرى.",
    "titlebar.copy_license":      "نسخ الترخيص",
    "titlebar.copied":            "تم النسخ!",
    // Expired overlay
    "expired.title":              "انتهى الترخيص",
    "expired.subtitle":           (r) => r || "انتهت صلاحية اشتراكك.",
    "expired.sub2":               "يرجى التواصل مع المشرف لتجديد الترخيص. سيفتح التطبيق بعد تأكيد التجديد.",
    "expired.badge_expired":      "● منتهي",
    "expired.badge_checking":     "● جارٍ التحقق…",
    "expired.badge_active":       "● نشط",
    "expired.btn_continue":       "التجديد من المشرف فقط",
    "expired.btn_checking":       "جارٍ التحقق من الترخيص…",
    "expired.btn_verified":       "✅ تم التحقق — جارٍ الاستئناف…",
    "expired.meta_license_id":    "معرّف الترخيص",
    "expired.meta_merchant_name": "اسم التاجر",
    "expired.meta_last_valid":    "آخر تحقق",
    "expired.meta_remaining":     "المدة المتبقية",
    "expired.meta_expired":       "منتهي",
    "expired.copy_license":       "نسخ معرّف الترخيص",
    "expired.copied":             "تم نسخ معرّف الترخيص!",
    "expired.err_copy":           "تعذّر نسخ معرّف الترخيص.",
    "expired.err_still":          (r) => r || "الترخيص لا يزال منتهياً. يرجى التواصل مع المشرف.",
    "expired.err_network":        "تعذّر الوصول إلى خادم الترخيص. تحقق من الاتصال بالإنترنت.",
    // License expiry warning
    "warning.kicker":             "تذكير بالتجديد",
    "warning.title":              "ترخيصك على وشك الانتهاء",
    "warning.body":               "لا تنسَ تجديد الترخيص للحفاظ على استمرار عملك دون توقف.",
    "warning.days_label":         "الأيام المتبقية",
    "warning.days_remaining":     (d) => d === 1 ? "يوم واحد متبقٍ" : "أيام متبقية",
    "warning.license_label":      "الترخيص",
    "warning.contact":            "تواصل مع الدعم للتجديد",
    "warning.later":              "ليس الآن",
    "warning.close":              "إغلاق",
    // Calendar widget
    "calendar.months": ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"],
    "calendar.days":   ["أح","إث","ثل","أر","خم","جم","سب"],
  },
};

// _t: O(1) lookup — no object rebuild per call, no nested closure allocation.
window._t = function(key) {
  const lang = window._kbotLang;
  const map  = _STRINGS[lang] || _STRINGS["en"];
  return map[key] !== undefined ? map[key] : (_STRINGS["en"][key] || key);
};

window.TaagerUI = (() => {
  function t(key, fallback) {
    const value = window._t ? window._t(key) : key;
    return typeof value === "string" && value !== key ? value : (fallback || value || key);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(message, options = {}) {
    const kind = options.kind || "info";
    let host = document.getElementById("taager-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "taager-toast-host";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "false");
      document.body.appendChild(host);
    }
    const item = document.createElement("div");
    item.className = `taager-toast taager-toast-${kind}${options.variant === "admin" ? " taager-toast-admin" : ""}`;
    item.innerHTML = `
      <div class="taager-toast-dot" aria-hidden="true"></div>
      <div class="taager-toast-content">
        ${options.title ? `<div class="taager-toast-title">${esc(options.title)}</div>` : ""}
        <div class="taager-toast-body">${esc(message || t(`ui.toast_${kind}`, t("ui.toast_info", "Updated")))}</div>
      </div>
      <button class="taager-toast-close" type="button" aria-label="${esc(t("ui.dismiss", "Dismiss"))}">×</button>
    `;
    host.appendChild(item);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      item.classList.add("taager-toast-out");
      setTimeout(() => item.remove(), 160);
      if (typeof options.onClose === "function") options.onClose();
    };
    item.querySelector("button")?.addEventListener("click", close);
    if (!options.persistent) setTimeout(close, options.timeout == null ? 4200 : options.timeout);
    return close;
  }

  function confirmDialog(options = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "taager-dialog-backdrop";
      overlay.setAttribute("role", "presentation");
      const title = options.title || t("ui.confirm_title", "Are you sure?");
      const message = options.message || "";
      const confirmText = options.confirmText || t("ui.ok", "OK");
      const cancelText = options.cancelText || t("ui.cancel", "Cancel");
      overlay.innerHTML = `
        <div class="taager-dialog" role="alertdialog" aria-modal="true" aria-labelledby="taager-dialog-title" aria-describedby="taager-dialog-body">
          ${options.kicker ? `<div class="taager-dialog-kicker">${esc(options.kicker)}</div>` : ""}
          <div class="taager-dialog-title" id="taager-dialog-title">${esc(title)}</div>
          <div class="taager-dialog-body" id="taager-dialog-body">${esc(message)}</div>
          <div class="taager-dialog-actions">
            <button class="btn btn-ghost" type="button" data-dialog-cancel>${esc(cancelText)}</button>
            <button class="btn ${options.danger ? "btn-danger" : "btn-primary"}" type="button" data-dialog-confirm>${esc(confirmText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const previousFocus = document.activeElement;
      const cancelBtn = overlay.querySelector("[data-dialog-cancel]");
      const confirmBtn = overlay.querySelector("[data-dialog-confirm]");
      const done = (value) => {
        overlay.remove();
        if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
        resolve(value);
      };
      cancelBtn?.addEventListener("click", () => done(false));
      confirmBtn?.addEventListener("click", () => done(true));
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") done(false);
      });
      confirmBtn?.focus();
    });
  }

  function loader(label) {
    return `
      <div class="taager-state taager-state-loading" role="status" aria-live="polite">
        <div class="taager-spinner" aria-hidden="true"></div>
        <div class="taager-state-title">${esc(label || t("ui.loading", "Loading..."))}</div>
      </div>
    `;
  }

  function stateBlock(options = {}) {
    const kind = options.kind || "empty";
    return `
      <div class="taager-state taager-state-${esc(kind)}">
        <div class="taager-state-icon" aria-hidden="true">${esc(options.icon || (kind === "error" ? "!" : "i"))}</div>
        <div class="taager-state-title">${esc(options.title || "")}</div>
        <div class="taager-state-body">${esc(options.body || "")}</div>
        ${options.actionText ? `<button class="btn btn-primary" type="button" data-taager-state-action>${esc(options.actionText)}</button>` : ""}
      </div>
    `;
  }

  function help(text, label) {
    const aria = label || t("ui.help", "Help");
    return `<span class="taager-help" tabindex="0" role="button" aria-label="${esc(aria)}" data-tooltip="${esc(text)}">?</span>`;
  }

  function enhance(root = document) {
    root.querySelectorAll("[data-tooltip]").forEach((el) => {
      if (el.dataset.taagerTooltipReady) return;
      el.dataset.taagerTooltipReady = "1";
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", el.getAttribute("data-tooltip") || t("ui.help", "Help"));
    });
    root.querySelectorAll("button:not([type])").forEach((btn) => btn.setAttribute("type", "button"));
  }

  return { t, esc, toast, confirm: confirmDialog, loader, stateBlock, help, enhance };
})();

const adminNotificationManager = window.AdminNotifications.createManager({
  storage: window.localStorage,
  showToast: (message, options) => window.TaagerUI.toast(message, options),
  isBlocked: () => Boolean(
    (window.isLicenseExpiryWarningVisible && window.isLicenseExpiryWarningVisible()) ||
    (window.isExpiredOverlayVisible && window.isExpiredOverlayVisible())
  ),
});

function handleAdminNotification(notification) {
  adminNotificationManager.offer(notification || null);
}

window.TaagerCountry = (() => {
  const COUNTRIES = {
    sa: { code: "SA", en: "Saudi Arabia", ar: "السعودية", currency: "SAR", locale: "ar-SA" },
    eg: { code: "EG", en: "Egypt", ar: "مصر", currency: "EGP", locale: "ar-EG-u-nu-latn" },
    iq: { code: "IQ", en: "Iraq", ar: "العراق", currency: "IQD", locale: "ar-IQ-u-nu-latn" },
    ae: { code: "AE", en: "United Arab Emirates", ar: "الإمارات", currency: "AED", locale: "ar-AE-u-nu-latn" },
    om: { code: "OM", en: "Oman", ar: "عمان", currency: "OMR", locale: "ar-OM-u-nu-latn" },
  };
  const COUNTRY_BY_CURRENCY = Object.keys(COUNTRIES).reduce((acc, key) => {
    acc[COUNTRIES[key].currency] = key;
    return acc;
  }, {});

  function normalize(value) {
    return String(value || "sa").trim().toLowerCase();
  }

  function get(value) {
    const key = normalize(value);
    return COUNTRIES[key] || COUNTRIES.sa;
  }

  function label(value, options = {}) {
    const item = get(value);
    const lang = options.lang || window._kbotLang || document.documentElement.lang || "en";
    const name = lang === "ar" ? item.ar : item.en;
    return options.withCode === false ? name : `${name} (${item.code})`;
  }

  function flagClass(value) {
    return `taager-country-flag flag:${get(value).code}`;
  }

  function currency(value) {
    return get(value).currency || "SAR";
  }

  function fromCurrency(value) {
    return COUNTRY_BY_CURRENCY[String(value || "").trim().toUpperCase()] || "sa";
  }

  function locale(value) {
    return get(value).locale || "ar-SA";
  }

  function all() {
    return Object.assign({}, COUNTRIES);
  }

  return { get, label, flagClass, currency, fromCurrency, locale, all };
})();

window.TaagerCurrency = (() => {
  const STORAGE_KEY = "taager_currency_rates_v1";
  const SUPPORTED = ["SAR", "USD", "EGP", "AED", "IQD", "OMR"];
  const DEFAULT_RATES = { USD: 1, SAR: 3.75, EGP: 52, AED: 3.6725, IQD: 1310, OMR: 0.385 };
  const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
  let cached = readStoredRates();
  let liveRefreshPromise = null;

  function cleanCurrency(value, fallback) {
    const cur = String(value || fallback || "SAR").trim().toUpperCase();
    return SUPPORTED.indexOf(cur) === -1 ? String(fallback || "SAR").toUpperCase() : cur;
  }

  function readStoredRates() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (parsed && parsed.rates && typeof parsed.rates === "object") {
        return Object.assign({}, DEFAULT_RATES, parsed.rates);
      }
    } catch (e) {
      console.warn("[Currency] Unable to read cached rates:", e);
    }
    return Object.assign({}, DEFAULT_RATES);
  }

  function readStoredMeta() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (parsed && typeof parsed === "object") {
        return {
          source: parsed.source || "defaults",
          updatedAt: parsed.updatedAt || "",
          rates: Object.assign({}, DEFAULT_RATES, parsed.rates || {})
        };
      }
    } catch (e) {
      console.warn("[Currency] Unable to read cached rate metadata:", e);
    }
    return {
      source: "defaults",
      updatedAt: "",
      rates: Object.assign({}, DEFAULT_RATES)
    };
  }

  function sanitizeRates(nextRates) {
    const out = Object.assign({}, DEFAULT_RATES);
    SUPPORTED.forEach((cur) => {
      const value = Number(nextRates && nextRates[cur]);
      if (isFinite(value) && value > 0) out[cur] = value;
    });
    out.USD = 1;
    return out;
  }

  function persistRates(rates, source) {
    cached = sanitizeRates(rates);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        source: source || "manual",
        updatedAt: new Date().toISOString(),
        rates: cached
      }));
    } catch (e) {
      console.warn("[Currency] Unable to persist rates:", e);
    }
    return Object.assign({}, cached);
  }

  function rates() {
    return Object.assign({}, cached);
  }

  function snapshot() {
    var stored = readStoredMeta();
    return {
      rates: Object.assign({}, cached),
      source: stored.source || "defaults",
      updatedAt: stored.updatedAt || "",
      base: "USD",
      supported: SUPPORTED.slice()
    };
  }

  function setManualRates(nextRates) {
    return persistRates(Object.assign({}, cached, nextRates || {}), "manual");
  }

  function resetRates() {
    return persistRates(Object.assign({}, DEFAULT_RATES), "defaults");
  }

  function isStale(maxAgeMs) {
    var meta = readStoredMeta();
    if (meta.source === "manual") return false;
    if (!meta.updatedAt) return true;
    var age = Date.now() - new Date(meta.updatedAt).getTime();
    return !isFinite(age) || age > (maxAgeMs || STALE_AFTER_MS);
  }

  function convert(value, from, to, opts) {
    const amount = Number(value || 0);
    if (!isFinite(amount)) return 0;
    const fromCur = cleanCurrency(from, "SAR");
    const toCur = cleanCurrency(to, fromCur);
    if (fromCur === toCur) return amount;
    const activeRates = Object.assign({}, cached, opts && opts.rates);
    const fromRate = Number(activeRates[fromCur] || DEFAULT_RATES[fromCur] || 1);
    const toRate = Number(activeRates[toCur] || DEFAULT_RATES[toCur] || 1);
    if (!fromRate || !toRate) return amount;
    return (amount / fromRate) * toRate;
  }

  function format(value, currency, opts) {
    opts = opts || {};
    const cur = cleanCurrency(currency, "SAR");
    const country = opts.country || (window.TaagerCountry && window.TaagerCountry.fromCurrency ? window.TaagerCountry.fromCurrency(cur) : "sa");
    const locale = opts.locale || (window.dashboardI18n && window.dashboardI18n.locale && window.dashboardI18n.locale()) || (window.TaagerCountry && window.TaagerCountry.locale ? window.TaagerCountry.locale(country) : "en-US");
    const decimals = opts.decimals == null ? 0 : Number(opts.decimals || 0);
    try {
      return new Intl.NumberFormat(locale, {
        style: opts.style === "code" ? "decimal" : "currency",
        currency: cur,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(Number(value || 0)) + (opts.style === "code" ? " " + cur : "");
    } catch (e) {
      return Number(value || 0).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }) + " " + cur;
    }
  }

  function countryCurrency(country) {
    return window.TaagerCountry && window.TaagerCountry.currency ? window.TaagerCountry.currency(country) : "SAR";
  }

  async function refreshLiveRates(url) {
    const endpoint = url || "https://open.er-api.com/v6/latest/USD";
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) throw new Error("Rate fetch failed: " + res.status);
    const json = await res.json();
    const sourceRates = json && json.rates ? json.rates : {};
    const next = {};
    SUPPORTED.forEach((cur) => {
      if (Number(sourceRates[cur]) > 0) next[cur] = Number(sourceRates[cur]);
    });
    return persistRates(Object.assign({}, DEFAULT_RATES, next), "live");
  }

  async function ensureLiveRates(opts) {
    opts = opts || {};
    var meta = readStoredMeta();
    if (meta.source === "manual" && !opts.force) {
      return { ok: true, refreshed: false, snapshot: snapshot() };
    }
    if (!opts.force && !isStale(opts.maxAgeMs || STALE_AFTER_MS)) {
      return { ok: true, refreshed: false, snapshot: snapshot() };
    }
    if (liveRefreshPromise) return liveRefreshPromise;
    liveRefreshPromise = refreshLiveRates(opts.url).then(function () {
      return { ok: true, refreshed: true, snapshot: snapshot() };
    }).catch(function (error) {
      console.warn("[Currency] Live rate refresh failed:", error);
      return { ok: false, refreshed: false, error: error && error.message ? error.message : String(error || "Rate refresh failed"), snapshot: snapshot() };
    }).finally(function () {
      liveRefreshPromise = null;
    });
    return liveRefreshPromise;
  }

  return {
    supported: SUPPORTED.slice(),
    defaults: Object.assign({}, DEFAULT_RATES),
    base: "USD",
    rates,
    snapshot,
    setManualRates,
    resetRates,
    isStale,
    refreshLiveRates,
    ensureLiveRates,
    convert,
    format,
    cleanCurrency,
    countryCurrency
  };
})();

window.TaagerGeo = (() => {
  const COLORS = ["#a855f7", "#14b8a6", "#3b82f6", "#f59e0b", "#ef4444", "#06b6d4", "#84cc16", "#ec4899", "#fb923c", "#8b5cf6", "#0ea5e9", "#a3e635"];
  // Normalized silhouettes. All map surfaces share this 400 x 340 atlas.
  // Keep these paths visually tuned: the dashboard renderer depends on this
  // atlas for country switching, mixed-country summaries, dots, and glows.
  const OUTLINES = {
    sa: "M43.493,151.359L43.014,151.359L41.644,149.933L40.89,148.872L40.068,148.177L36.438,146.749L35.89,145.833L36.507,144.917L36.849,145.833L37.534,146.346L40.548,147.664L43.904,150.445L44.521,150.701ZM140.274,328.281L141.712,328.384L141.096,327.729L140.959,327.418L141.644,326.521L143.699,328.419L143.63,330.625L143.493,331.142L142.945,330.659L142.534,330.211L142.397,329.694L141.849,329.143L139.795,329.487L138.562,328.901L136.712,327.004L136.233,325.659L136.986,325.383L137.808,324.727L138.288,323.657L137.808,322.552L138.904,322.724L139.521,323.864L139.589,326.452L139.795,327.004L139.452,327.591ZM330.342,282.681L325.822,283.31L321.507,283.938L316.644,284.637L310.753,285.474L306.164,286.103L299.452,287.08L293.425,287.917L287.808,288.719L282.123,289.521L277.329,290.218L274.452,291.019L271.096,292.726L265.89,295.407L260.616,298.12L257.945,299.511L255.068,303.124L253.63,304.929L250.959,308.225L248.973,310.721L246.644,313.665L245.616,316.33L244.041,320.375L242.671,321.412L240.411,322.724L238.356,323.657L235.137,323.553L233.356,321.032L231.37,318.405L230.411,317.333L229.589,317.264L226.37,317.609L222.466,318.024L217.945,317.575L212.671,317.056L207.74,316.606L205.274,316.26L202.055,314.53L201.233,314.184L200.342,314.115L196.575,314.045L192.74,314.011L188.904,314.565L185.274,314.357L181.507,314.669L180.137,315.326L178.699,315.291L177.74,315.88L176.986,316.157L175.959,315.638L174.795,315.776L173.082,315.326L171.918,314.219L170.89,313.215L169.795,312.66L168.562,312.349L167.466,312.314L166.096,312.938L165.274,313.526L163.151,315.465L163.082,316.157L164.041,317.298L163.699,317.851L162.466,318.543L162.123,320.375L161.918,321.377L161.712,323.76L162.26,325.659L163.014,326.349L163.082,327.177L162.671,328.798L161.507,329.281L160.685,330.832L160.137,331.555L159.247,332.382L155.685,335.103L155.479,333.519L154.384,331.176L154.315,329.487L153.767,327.832L152.808,326.556L151.027,325.245L150.822,323.415L149.521,321.619L147.808,320.168L146.781,317.506L146.096,313.942L141.507,309.265L135.753,304.964L133.973,302.499L131.096,297.529L129.658,293.597L125.822,289.067L125.685,287.324L125.068,285.195L124.178,282.821L123.699,280.934L119.795,272.711L118.562,271.414L117.466,269.556L117.192,268.153L116.849,267.381L114.178,266.012L111.575,262.534L103.973,257.011L100.205,256.483L97.26,254.511L95.068,251.902L92.74,247.455L88.63,242.649L85.205,235.779L86.301,233.26L86.233,231.521L85.137,228.537L83.973,226.262L83.151,224.092L83.836,220.958L84.041,217.464L84.726,215.608L85.205,213.573L84.589,209.462L83.425,207.279L83.562,205.81L82.26,205.094L81.164,203.481L82.26,203.517L80.274,201.293L79.521,200.073L78.767,197.057L77.808,194.756L74.726,189.5L73.219,186.292L69.863,182.176L66.233,179.103L63.973,177.729L62.877,176.462L60.959,176.389L58.904,174.578L57.466,174.542L55.685,174.252L53.562,170.735L51.781,167.467L48.767,163.177L49.521,162.048L50.411,160.227L50,157.858L49.521,156.253L48.219,153.296L43.836,145.906L42.671,144.844L40.822,143.597L39.726,140.368L39.178,137.502L36.164,136.105L31.096,125.711L28.082,122.052L26.918,119.609L23.493,115.569L21.849,111.523L18.356,107.804L15.342,101.358L10.753,94.856L8.767,93.733L4.041,93.284L1.986,92.797L0.137,94.219L0,92.422L1.301,89.911L3.082,84.655L3.493,80.027L6.37,66.276L10.411,66.958L13.767,67.564L18.63,68.435L23.699,69.306L26.644,69.836L27.603,69.609L31.712,66.239L35.411,63.167L37.603,59.445L39.726,55.793L40.685,55.031L43.973,54.384L49.178,53.279L54.315,52.211L54.658,51.868L55.89,48.929L57.397,45.221L57.74,44.838L58.082,44.456L61.781,42.35L63.973,41.085L60.822,37.363L57.808,33.828L54.452,29.862L51.644,26.777L47.329,22.141L44.589,19.083L49.452,17.65L54.726,16.099L60.068,14.508L66.507,12.605L71.507,11.128L79.041,8.91L82.671,7.82L83.356,7.548L86.164,4.897L90.411,5.638L96.781,6.768L102.945,7.82L109.452,9.066L111.575,10.117L117.808,13.848L121.918,16.293L126.644,19.161L132.603,22.683L136.644,25.117L141.918,28.243L145.959,31.788L151.164,36.288L156.781,41.2L161.438,45.03L167.877,50.265L174.247,55.412L180.411,60.471L185.411,64.495L191.644,69.571L192.192,69.76L198.493,70.327L207.055,71.122L215.616,71.878L223.356,72.596L226.712,71.878L230.342,72.331L235.274,72.974L238.219,73.389L243.836,74.182L245.548,77.503L246.164,79.801L246.712,82.06L248.356,84.091L252.192,84.054L255.548,84.016L259.726,83.941L263.082,83.903L264.11,85.933L264.589,87.96L266.575,92.759L269.384,96.502L270,97.847L270.479,99.902L270,100.686L269.795,101.544L271.849,103.595L275.342,105.31L276.644,105.757L278.151,106.539L276.986,107.693L279.041,110.445L281.37,113.194L283.904,113.825L287.329,118.016L292.397,120.719L295.548,124.27L295.274,124.344L294.315,123.974L293.219,123.494L292.877,123.937L292.877,125.416L293.219,127.151L294.795,128.664L296.233,129.734L296.781,131.798L295.616,136.215L295.274,136.179L294.521,135.811L293.699,135.737L293.288,135.995L294.247,139.156L295.137,141.579L296.301,143.487L297.26,146.309L298.014,147.481L301.37,150.482L302.329,152.967L303.288,157.603L305.342,160.154L306.507,162.157L308.014,163.832L308.973,166.123L310.342,167.903L311.096,168.339L312.123,168.52L313.493,168.52L315.068,168.085L316.781,167.649L318.151,168.52L319.521,168.411L319.658,169.247L318.767,170.372L317.603,173.201L319.247,173.672L320.753,173.89L321.918,174.361L322.534,174.361L322.534,174.94L322.603,177.656L323.014,178.669L323.699,179.574L324.726,180.947L325.753,182.321L326.849,183.693L327.877,185.029L328.904,186.4L330,187.77L331.027,189.104L332.055,190.473L333.082,191.841L334.178,193.209L335.205,194.54L336.233,195.907L337.329,197.272L338.356,198.637L339.384,199.966L340.411,201.329L341.301,202.441L342.877,202.657L343.425,202.728L344.863,202.908L347.055,203.23L350,203.589L353.425,204.055L357.26,204.556L361.37,205.094L365.616,205.667L369.863,206.24L373.904,206.777L377.74,207.279L381.233,207.744L384.11,208.138L386.37,208.424L387.808,208.603L388.288,208.675L389.795,208.889L390.068,208.818L391.37,207.171L392.74,209.498L393.904,211.429L395.479,214.109L397.192,216.929L398.836,219.604L400,221.635L399.384,223.7L398.699,225.978L398.014,228.218L397.26,230.491L396.575,232.764L395.89,235.034L395.205,237.303L394.521,239.534L393.767,241.8L393.082,244.063L392.397,246.325L391.712,248.55L391.027,250.809L390.342,253.066L389.589,255.321L388.904,257.54L388.219,259.792L387.397,262.499L385.342,263.202L382.123,264.361L378.836,265.52L375.548,266.679L372.26,267.872L368.973,269.03L365.753,270.187L362.466,271.344L359.178,272.501L355.89,273.657L352.603,274.812L349.384,275.968L346.096,277.123L342.808,278.277L339.521,279.431L336.301,280.585L333.014,281.738ZM37.671,144.404L37.466,144.697L36.644,143.927L36.712,142.313L37.397,141.396L37.329,142.643L37.671,143.927Z",
    eg: "M76 65 C110 59 170 60 213 66 C229 70 244 80 266 76 C291 72 318 87 334 105 C326 123 304 138 286 146 C286 164 293 187 304 216 C313 240 302 269 282 296 L263 322 C248 319 229 313 215 303 C204 267 193 230 180 196 C171 176 154 161 134 144 C115 128 96 123 82 112 C77 96 75 78 76 65 Z",
    ae: "M68 225 C98 213 130 198 165 178 C202 157 244 126 279 109 C299 111 324 113 340 120 C330 135 308 148 289 157 C302 166 321 178 318 188 C302 201 278 205 260 212 C248 228 232 237 210 240 C188 251 166 258 142 254 C116 251 91 245 68 239 Z",
    iq: "M184 34 C208 39 238 55 258 75 C279 96 298 112 295 129 C291 146 285 153 293 167 C305 187 318 219 316 228 C306 246 289 270 269 304 C252 314 229 318 209 310 C190 300 174 282 158 266 C140 251 126 241 119 223 C112 204 111 185 119 166 C128 144 145 124 154 103 C164 80 172 56 184 34 Z",
    om: "M271 42 C288 55 306 75 307 91 C303 108 305 122 314 146 C321 169 308 198 289 224 C275 244 260 268 242 292 C223 307 197 319 171 314 C149 311 134 295 126 282 C134 266 150 250 166 233 C176 216 183 194 196 176 C212 154 225 132 235 105 C244 77 258 55 271 42 Z M286 29 C299 35 307 48 300 59 C291 61 282 55 278 45 C279 38 282 33 286 29 Z"
  };
  const VISUAL_PROFILES = {
    default: {
      dotBase: 4,
      dotRange: 8.5,
      dotMax: 13,
      haloScale: 2.45,
      glowOpacity: 0.34,
      strokeWidth: 1.55,
      coastWidth: 0,
      shadowOpacityDark: 0.1,
      shadowOpacityLight: 0.18,
      sheenOpacityDark: 0,
      sheenOpacityLight: 0.08
    },
    sa: { dotRange: 8.8, dotMax: 13.2, glowOpacity: 0.36, shadowOpacityDark: 0.08 },
    eg: { dotRange: 8.2, dotMax: 12.8, glowOpacity: 0.34 },
    ae: { dotRange: 7.6, dotMax: 12, glowOpacity: 0.32 },
    iq: { dotRange: 8, dotMax: 12.5, glowOpacity: 0.34 },
    om: { dotRange: 7.8, dotMax: 12.3, glowOpacity: 0.33 }
  };
  const GEO = {
    sa: [
      ["riyadh", "منطقة الرياض", 230, 164, 92, 76, ["الرياض", "الخرج", "المجمعة", "الدوادمي", "riyadh"]],
      ["eastern", "المنطقة الشرقية", 298, 140, 55, 45, ["الشرقية", "الدمام", "الخبر", "الأحساء", "الاحساء", "eastern"]],
      ["mecca", "منطقة مكة المكرمة", 95, 238, 50, 38, ["مكة", "جدة", "جده", "الطائف", "mecca", "jeddah"]],
      ["jazan", "منطقة جازان", 158, 304, 28, 22, ["جيزان", "جازان", "jazan", "gizan"]],
      ["baha", "منطقة الباحة", 132, 258, 24, 18, ["الباحة", "baha"]],
      ["madinah", "منطقة المدينة المنورة", 92, 175, 38, 30, ["المدينة", "ينبع", "madinah", "medina"]],
      ["aseer", "منطقة عسير", 152, 272, 35, 24, ["عسير", "أبها", "ابها", "خميس", "aseer"]],
      ["qassim", "منطقة القصيم", 194, 132, 38, 30, ["القصيم", "بريدة", "عنيزة", "qassim"]],
      ["tabuk", "منطقة تبوك", 80, 110, 42, 32, ["تبوك", "tabuk"]],
      ["hail", "منطقة حائل", 160, 125, 32, 24, ["حائل", "hail"]],
      ["najran", "منطقة نجران", 198, 304, 28, 20, ["نجران", "najran"]],
      ["jawf", "منطقة الجوف", 140, 80, 30, 22, ["الجوف", "سكاكا", "jawf", "jouf"]],
      ["northern", "منطقة الحدود الشمالية", 100, 70, 28, 20, ["الحدود الشمالية", "عرعر", "northern", "arar"]]
    ],
    eg: [
      ["cairo", "القاهرة", 238, 138, 34, 28, ["القاهرة", "القاهره", "cairo"]],
      ["giza", "الجيزة", 213, 150, 34, 28, ["الجيزة", "الجيزه", "giza"]],
      ["alex", "الإسكندرية", 170, 83, 38, 24, ["الإسكندرية", "الاسكندرية", "اسكندرية", "alex"]],
      ["delta", "الدلتا", 232, 98, 58, 34, ["الدقهلية", "الغربية", "الشرقية", "المنوفية", "كفر الشيخ", "القليوبية", "دمياط", "dakahlia", "sharkia"]],
      ["canal", "القناة وسيناء", 298, 126, 48, 36, ["بور سعيد", "بورسعيد", "الإسماعيلية", "الاسماعيلية", "السويس", "سيناء", "port said", "suez"]],
      ["upper", "الصعيد", 246, 232, 50, 80, ["أسيوط", "اسيوط", "سوهاج", "قنا", "الأقصر", "الاقصر", "أسوان", "اسوان", "بني سويف", "الفيوم", "المنيا"]],
      ["redsea", "البحر الأحمر", 310, 232, 34, 70, ["البحر الأحمر", "الغردقة", "الغردقه", "red sea", "hurghada"]],
      ["matrouh", "مطروح", 96, 110, 55, 34, ["مطروح", "matrouh"]],
      ["beheira", "البحيرة", 190, 108, 38, 26, ["البحيرة", "البحيره", "beheira"]]
    ],
    ae: [
      ["dubai", "دبي", 206, 180, 34, 24, ["دبي", "dubai"]],
      ["abudhabi", "أبو ظبي", 146, 226, 60, 34, ["أبو ظبي", "ابوظبي", "أبوظبي", "abu dhabi"]],
      ["sharjah", "الشارقة", 232, 162, 30, 22, ["الشارقة", "الشارقه", "sharjah"]],
      ["ajman", "عجمان", 248, 154, 24, 18, ["عجمان", "ajman"]],
      ["rak", "رأس الخيمة", 286, 118, 34, 24, ["رأس الخيمة", "راس الخيمة", "rak", "ras al khaimah"]],
      ["fujairah", "الفجيرة", 305, 167, 30, 28, ["الفجيرة", "الفجيره", "fujairah"]],
      ["uaq", "أم القيوين", 267, 141, 24, 18, ["أم القيوين", "ام القيوين", "umm al quwain"]]
    ],
    iq: [
      ["baghdad", "بغداد", 215, 173, 46, 34, ["بغداد", "baghdad"]],
      ["basra", "البصرة", 261, 286, 42, 30, ["البصرة", "بصرة", "basra"]],
      ["najaf", "النجف", 184, 231, 36, 26, ["النجف", "نجف", "najaf"]],
      ["karbala", "كربلاء", 178, 205, 34, 26, ["كربلاء", "karbala"]],
      ["mosul", "نينوى / الموصل", 204, 84, 46, 32, ["الموصل", "موصل", "نينوى", "نينوي", "mosul", "nineveh"]],
      ["kurdistan", "إقليم كردستان", 258, 64, 58, 34, ["أربيل", "اربيل", "السليمانية", "سليمانية", "دهوك", "erbil", "sulaymaniyah", "duhok"]],
      ["kirkuk", "كركوك", 238, 112, 34, 24, ["كركوك", "kirkuk"]],
      ["diyala", "ديالى", 267, 155, 34, 28, ["ديالى", "ديالي", "diyala"]],
      ["anbar", "الأنبار", 124, 162, 62, 48, ["الأنبار", "الانبار", "anbar", "ramadi"]],
      ["salahaddin", "صلاح الدين", 224, 136, 36, 26, ["صلاح الدين", "تكريت", "salah al din", "salahaddin", "saladin", "tikrit"]],
      ["south", "جنوب العراق", 234, 248, 60, 42, ["واسط", "كوت", "بابل", "ذي قار", "ميسان", "الديوانية", "ديوانية", "دوانية", "القادسية", "المثنى", "سماوة"]]
    ],
    om: [
      ["muscat", "مسقط", 257, 164, 40, 26, ["مسقط", "مطرح", "بوشر", "السيب", "muscat"]],
      ["batinah", "الباطنة", 218, 132, 58, 30, ["صحار", "بركاء", "السويق", "الخابورة", "شناص", "لوى", "صحم", "الباطنة"]],
      ["dhofar", "ظفار", 165, 292, 62, 34, ["صلالة", "ظفار", "ثمريت", "طاقة", "مرباط", "dhofar", "salalah"]],
      ["dakhiliyah", "الداخلية", 214, 188, 46, 34, ["نزوى", "بهلاء", "إزكي", "ازكي", "سمائل", "الحمراء", "الداخلية"]],
      ["sharqiyah", "الشرقية", 286, 210, 52, 40, ["صور", "إبراء", "ابراء", "بدية", "القابل", "المضيبي", "جعلان", "الشرقية"]],
      ["dhahirah", "الظاهرة", 166, 166, 44, 32, ["عبري", "ينقل", "ضنك", "الظاهرة"]],
      ["buraimi", "البريمي", 150, 118, 34, 24, ["البريمي", "محضة", "buraimi"]],
      ["musandam", "مسندم", 275, 58, 32, 22, ["خصب", "بخاء", "مسندم", "musandam"]],
      ["wusta", "الوسطى", 218, 250, 56, 42, ["الدقم", "هيما", "محوت", "مصيرة", "الوسطى"]]
    ]
  };

  function atlasData() {
    return window.TaagerCountryAtlas || {};
  }

  function atlasColors() {
    const atlas = atlasData();
    return Array.isArray(atlas.colors) && atlas.colors.length ? atlas.colors : COLORS;
  }

  function atlasOutlines() {
    const atlas = atlasData();
    return atlas.outlines || OUTLINES;
  }

  function atlasRegions() {
    const atlas = atlasData();
    return atlas.regions || GEO;
  }

  function atlasProfiles() {
    const atlas = atlasData();
    return atlas.visualProfiles || VISUAL_PROFILES;
  }

  function atlasCityPoints() {
    const atlas = atlasData();
    return atlas.cityPoints || {};
  }

  function normalizeCountry(country) {
    const key = String(country || "sa").trim().toLowerCase();
    const regions = atlasRegions();
    const outlines = atlasOutlines();
    return (regions[key] || outlines[key]) ? key : "sa";
  }

  function textKey(value) {
    return String(value || "").toLowerCase()
      .normalize("NFKC")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\w\u0600-\u06ff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function rows(country) {
    const regions = atlasRegions();
    return regions[normalizeCountry(country)] || regions.sa || GEO.sa;
  }

  function provinceMap(country) {
    const out = {};
    const colors = atlasColors();
    rows(country).forEach((entry, index) => {
      out[entry[0]] = {
        id: entry[0],
        name: entry[1],
        color: colors[index % colors.length],
        x: entry[2],
        y: entry[3],
        rx: entry[4],
        ry: entry[5],
        keys: entry[6] || []
      };
    });
    out.other = { id: "other", name: "مناطق أخرى", color: "#64748b", x: 205, y: 190, rx: 30, ry: 22, keys: [] };
    return out;
  }

  function resolveProvince(cityName, country) {
    if (!cityName) return "other";
    const city = textKey(cityName);
    const list = rows(country);
    for (let i = 0; i < list.length; i++) {
      const id = list[i][0];
      const keys = list[i][6] || [];
      for (let j = 0; j < keys.length; j++) {
        const key = textKey(keys[j]);
        if (key && (city.indexOf(key) !== -1 || key.indexOf(city) !== -1)) return id;
      }
    }
    return "other";
  }

  function outline(country) {
    const outlines = atlasOutlines();
    return outlines[normalizeCountry(country)] || outlines.sa || OUTLINES.sa;
  }

  function viewBox(country) {
    const atlas = atlasData();
    if (typeof atlas.viewBox === "function") return atlas.viewBox(normalizeCountry(country));
    if (atlas.viewBox && typeof atlas.viewBox === "object") {
      const cc = normalizeCountry(country);
      return atlas.viewBox[cc] || atlas.viewBox.default || "0 0 400 340";
    }
    return atlas.viewBox || "0 0 400 340";
  }

  function visualProfile(country) {
    const cc = normalizeCountry(country);
    const profiles = atlasProfiles();
    return Object.assign({}, profiles.default || VISUAL_PROFILES.default, profiles[cc] || {});
  }

  function resolveCityPoint(cityName, country) {
    if (!cityName) return null;
    const cc = normalizeCountry(country);
    const city = textKey(cityName);
    const points = atlasCityPoints()[cc] || [];
    for (let i = 0; i < points.length; i++) {
      const entry = points[i];
      const keys = entry[2] || [];
      for (let j = 0; j < keys.length; j++) {
        const key = textKey(keys[j]);
        if (key && (city === key || city.indexOf(key) !== -1 || key.indexOf(city) !== -1)) {
          return { x: Number(entry[0]), y: Number(entry[1]) };
        }
      }
    }
    return null;
  }

  function clipRegionCell(polygon, a, b, c) {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i];
      const previous = polygon[(i + polygon.length - 1) % polygon.length];
      const currentValue = a * current[0] + b * current[1] - c;
      const previousValue = a * previous[0] + b * previous[1] - c;
      const currentInside = currentValue <= 0.001;
      const previousInside = previousValue <= 0.001;
      if (currentInside !== previousInside) {
        const denominator = previousValue - currentValue;
        const t = Math.abs(denominator) < 0.0001 ? 0 : previousValue / denominator;
        result.push([
          previous[0] + (current[0] - previous[0]) * t,
          previous[1] + (current[1] - previous[1]) * t
        ]);
      }
      if (currentInside) result.push(current);
    }
    return result;
  }

  function regionPath(entries, index) {
    const target = entries[index];
    const x1 = Number(target[2]);
    const y1 = Number(target[3]);
    let polygon = [[0, 0], [400, 0], [400, 340], [0, 340]];
    entries.forEach((entry, otherIndex) => {
      if (otherIndex === index || !polygon.length) return;
      const x2 = Number(entry[2]);
      const y2 = Number(entry[3]);
      polygon = clipRegionCell(
        polygon,
        2 * (x2 - x1),
        2 * (y2 - y1),
        x2 * x2 + y2 * y2 - x1 * x1 - y1 * y1
      );
    });
    return "M" + polygon.map((point) =>
      (Math.round(point[0] * 10) / 10) + " " + (Math.round(point[1] * 10) / 10)
    ).join("L") + "Z";
  }

  function shape(country) {
    const cc = normalizeCountry(country);
    return {
      country: cc,
      viewBox: viewBox(cc),
      outline: outline(cc),
      profile: visualProfile(cc),
      regions: rows(cc).map((entry, index, entries) => ({
        id: cc + "-" + entry[0],
        provinceId: entry[0],
        path: regionPath(entries, index),
        cx: entry[2],
        cy: entry[3]
      }))
    };
  }

  function cityPoint(cityName, country, index) {
    const cc = normalizeCountry(country);
    const pid = resolveProvince(cityName, cc);
    const exact = resolveCityPoint(cityName, cc);
    if (exact && Number.isFinite(exact.x) && Number.isFinite(exact.y)) {
      return {
        country: cc,
        provinceId: pid,
        x: Math.max(18, Math.min(382, exact.x)),
        y: Math.max(18, Math.min(322, exact.y))
      };
    }
    const meta = provinceMap(cc)[pid] || provinceMap(cc).other;
    const key = textKey(cityName) || String(index || 0);
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    const angle = ((Math.abs(hash) % 360) * Math.PI) / 180;
    const radius = 4 + (Math.abs(hash >> 4) % 10);
    return {
      country: cc,
      provinceId: pid,
      x: Math.max(18, Math.min(382, Number(meta.x || 205) + Math.cos(angle) * radius)),
      y: Math.max(18, Math.min(322, Number(meta.y || 190) + Math.sin(angle) * radius))
    };
  }

  function spreadCityPoints(cities, options) {
    const opts = options || {};
    const minDistance = Number(opts.minDistance || 24);
    const maxShift = Number(opts.maxShift || 28);
    const bounds = Object.assign({ minX: 22, maxX: 378, minY: 20, maxY: 320 }, opts.bounds || {});
    const points = (Array.isArray(cities) ? cities : []).map((city, index) => {
      const x = Number(city && city.x);
      const y = Number(city && city.y);
      return Object.assign({}, city, {
        x: Number.isFinite(x) ? x : 205,
        y: Number.isFinite(y) ? y : 190,
        anchorX: Number.isFinite(x) ? x : 205,
        anchorY: Number.isFinite(y) ? y : 190,
        _spreadIndex: index
      });
    });
    for (let pass = 0; pass < Number(opts.iterations || 28); pass++) {
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i];
          const b = points[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (!dist) {
            const seed = textKey(a.name || a.city || i) + "|" + textKey(b.name || b.city || j);
            let hash = 0;
            for (let k = 0; k < seed.length; k++) hash = ((hash << 5) - hash + seed.charCodeAt(k)) | 0;
            const angle = ((Math.abs(hash) % 360) * Math.PI) / 180;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
          }
          if (dist >= minDistance) continue;
          const push = (minDistance - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
      points.forEach((point) => {
        point.x += (point.anchorX - point.x) * 0.035;
        point.y += (point.anchorY - point.y) * 0.035;
        const shiftX = point.x - point.anchorX;
        const shiftY = point.y - point.anchorY;
        const shift = Math.sqrt(shiftX * shiftX + shiftY * shiftY);
        if (shift > maxShift) {
          const scale = maxShift / shift;
          point.x = point.anchorX + shiftX * scale;
          point.y = point.anchorY + shiftY * scale;
        }
        point.x = Math.max(bounds.minX, Math.min(bounds.maxX, point.x));
        point.y = Math.max(bounds.minY, Math.min(bounds.maxY, point.y));
      });
    }
    return points.map((point) => {
      const out = Object.assign({}, point, {
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
        rawX: point.anchorX,
        rawY: point.anchorY
      });
      delete out.anchorX;
      delete out.anchorY;
      delete out._spreadIndex;
      return out;
    });
  }

  return { provinceMap, resolveProvince, textKey, outline, shape, viewBox, visualProfile, cityPoint, spreadCityPoints };
})();

// ── Theme & Lang helpers ──
const TaagerDebug = window.TaagerDebug || {
  enabled: true,
  seq: 0,
  startedAt: Date.now(),
  records: []
};

function debugDomSnapshot() {
  const activePage = document.querySelector(".page.active");
  const dashboardMount = document.getElementById("db-shell-mount");
  const dashboardLoader = document.getElementById("dashboard-live-preloader");
  const preloader = document.getElementById("preloader");
  return {
    activePage: activePage ? activePage.id : null,
    preloader: !!preloader,
    preloaderOpacity: preloader ? preloader.style.opacity || "" : "",
    dashboardInitialReady: !!window._dashboardInitialReady,
    dashboardMounted: !!(window.TaagerPageLifecycle && window.TaagerPageLifecycle.snapshot && window.TaagerPageLifecycle.snapshot()["page-dashboard"]?.mounted),
    dashboardInvalid: !!(window.TaagerPageLifecycle && window.TaagerPageLifecycle.snapshot && window.TaagerPageLifecycle.snapshot()["page-dashboard"]?.invalid),
    dashboardShell: !!dashboardMount,
    dashboardShellClass: dashboardMount ? dashboardMount.className : "",
    dashboardActiveSection: dashboardMount ? dashboardMount._dashboardActiveSection || null : null,
    dashboardLoader: !!dashboardLoader,
    stabilizing: document.documentElement.classList.contains("taager-ui-stabilizing")
  };
}

function taagerDebugLog(scope, event, detail, level) {
  if (!TaagerDebug.enabled) return;
  const seq = ++TaagerDebug.seq;
  const record = {
    seq,
    at: new Date().toISOString(),
    elapsedMs: Date.now() - TaagerDebug.startedAt,
    scope,
    event,
    detail: detail || {},
    dom: debugDomSnapshot()
  };
  TaagerDebug.records.push(record);
  if (TaagerDebug.records.length > 600) TaagerDebug.records.shift();
  const method = level || "log";
  const consoleMethod = console[method] || console.log;
  consoleMethod.call(console, `[TaagerDebug #${seq} +${record.elapsedMs}ms][${scope}] ${event}`, {
    detail: record.detail,
    dom: record.dom
  });
}

TaagerDebug.dump = function () {
  console.table(TaagerDebug.records.map((item) => ({
    seq: item.seq,
    elapsedMs: item.elapsedMs,
    scope: item.scope,
    event: item.event,
    activePage: item.dom && item.dom.activePage,
    section: item.dom && item.dom.dashboardActiveSection,
    preloader: item.dom && item.dom.preloader,
    loader: item.dom && item.dom.dashboardLoader,
    stabilizing: item.dom && item.dom.stabilizing
  })));
  return TaagerDebug.records.slice();
};
window.TaagerDebug = TaagerDebug;
window.TaagerDebugLog = taagerDebugLog;

function afterNextPaint(callback) {
  const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0));
  raf(() => raf(callback));
}
window.TaagerAfterNextPaint = afterNextPaint;
window.TaagerDashboardMotionDisabled = true;

function taagerDashboardMotionDisabled() {
  return window.TaagerDashboardMotionDisabled !== false;
}
window.TaagerDashboardMotionDisabledCheck = taagerDashboardMotionDisabled;

function waitForStableUi(options) {
  const opts = options || {};
  const quietMs = Number(opts.quietMs || 90);
  const maxWaitMs = Number(opts.maxWaitMs || 1400);
  const startedAt = Date.now();
  taagerDebugLog("ui", "waitForStableUi:start", { quietMs, maxWaitMs });
  const fontsReady = window.taagerFontsReady && typeof window.taagerFontsReady.then === "function"
    ? window.taagerFontsReady.catch(() => false)
    : Promise.resolve(false);
  const frame = () => new Promise((resolve) => afterNextPaint(resolve));
  return fontsReady.then(() => frame())
    .then(() => frame())
    .then(() => new Promise((resolve) => {
      const finish = () => frame().then(resolve);
      const remaining = Math.max(0, maxWaitMs - (Date.now() - startedAt));
      window.setTimeout(finish, Math.min(quietMs, remaining || quietMs));
    }))
    .then((value) => {
      taagerDebugLog("ui", "waitForStableUi:done", { elapsedMs: Date.now() - startedAt });
      return value;
    });
}
window.TaagerWaitForStableUi = waitForStableUi;

let _routeCurtainToken = 0;
const _uiStabilizationLocks = new Set();
const _routeCurtainLocks = new Map();

function beginUiStabilization(label) {
  const lock = Symbol(label || "ui-stabilization");
  _uiStabilizationLocks.add(lock);
  document.documentElement.classList.add("taager-ui-stabilizing");
  taagerDebugLog("ui", "stabilization:begin", { label: label || "", locks: _uiStabilizationLocks.size });
  return lock;
}

function endUiStabilization(lock) {
  if (lock) _uiStabilizationLocks.delete(lock);
  if (!_uiStabilizationLocks.size) document.documentElement.classList.remove("taager-ui-stabilizing");
  taagerDebugLog("ui", "stabilization:end", { locks: _uiStabilizationLocks.size });
}

window.TaagerIsUiStabilizing = function () {
  return _uiStabilizationLocks.size > 0 || document.documentElement.classList.contains("taager-ui-stabilizing");
};

function showRouteCurtain(title, body) {
  const token = ++_routeCurtainToken;
  _routeCurtainLocks.set(token, beginUiStabilization("route-curtain"));
  taagerDebugLog("route-curtain", "show", { token, title, body, blockedByPreloader: !!document.getElementById("preloader") });
  if (document.getElementById("preloader")) return token;
  let curtain = document.getElementById("taager-route-curtain");
  if (!curtain) {
    curtain = document.createElement("div");
    curtain.id = "taager-route-curtain";
    curtain.className = "taager-route-curtain";
    curtain.setAttribute("role", "status");
    curtain.setAttribute("aria-live", "polite");
    document.body.appendChild(curtain);
  }
  const esc = window.TaagerUI && window.TaagerUI.esc
    ? window.TaagerUI.esc
    : (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  curtain.innerHTML = featureLoadingShell(title || "Loading", body || "Preparing view...");
  curtain.hidden = false;
  curtain.classList.add("is-visible");
  return token;
}

function hideRouteCurtainWhenStable(token) {
  taagerDebugLog("route-curtain", "hideWhenStable:start", { token, currentToken: _routeCurtainToken });
  return waitForStableUi().then(() => {
    const stabilizationLock = _routeCurtainLocks.get(token);
    if (token && token !== _routeCurtainToken) {
      taagerDebugLog("route-curtain", "hideWhenStable:stale", { token, currentToken: _routeCurtainToken });
      _routeCurtainLocks.delete(token);
      endUiStabilization(stabilizationLock);
      return;
    }
    const curtain = document.getElementById("taager-route-curtain");
    if (!curtain) {
      taagerDebugLog("route-curtain", "hideWhenStable:no-curtain", { token });
      _routeCurtainLocks.delete(token);
      endUiStabilization(stabilizationLock);
      return;
    }
    curtain.classList.remove("is-visible");
    window.setTimeout(() => {
      if (token && token !== _routeCurtainToken) {
        taagerDebugLog("route-curtain", "hideWhenStable:timer-stale", { token, currentToken: _routeCurtainToken });
        _routeCurtainLocks.delete(token);
        endUiStabilization(stabilizationLock);
        return;
      }
      curtain.hidden = true;
      _routeCurtainLocks.delete(token);
      endUiStabilization(stabilizationLock);
      taagerDebugLog("route-curtain", "hideWhenStable:done", { token });
    }, 180);
  });
}

window.TaagerRouteCurtain = {
  show: showRouteCurtain,
  hideWhenStable: hideRouteCurtainWhenStable
};

function applyTheme(theme) {
  window._kbotTheme = theme;
  document.documentElement.classList.add("theme-switching");
  document.documentElement.setAttribute("data-theme", theme);
  afterNextPaint(() => document.documentElement.classList.remove("theme-switching"));
  const cb = document.getElementById("toggle-theme");
  if (cb) cb.checked = (theme === "light");
  try { localStorage.setItem("kbot-theme", theme); } catch(e) {}
  if (window.TaagerMonitoring) {
    window.TaagerMonitoring.setUiContext({
      activeRoute: window.__taagerActiveRoute || "",
      language: window._kbotLang || "",
      theme,
    });
  }
}

let _langSwitchToken = 0;
function applyLang(lang, options) {
  const opts = options || {};
  window._kbotLang = lang;
  document.documentElement.setAttribute("dir",  lang === "ar" ? "rtl" : "ltr");
  document.documentElement.setAttribute("lang", lang);
  const cb = document.getElementById("toggle-lang");
  if (cb) cb.checked = (lang === "ar");
  updateTopBarText();
  try { localStorage.setItem("kbot-lang", lang); } catch(e) {}
  const notifyLanguageChange = () => {
    window.dispatchEvent(new CustomEvent("taager-lang-change", { detail: { lang } }));
    if (typeof invalidatePage === "function") {
      invalidatePage("page-dashboard", "language");
      invalidatePage("page-analytics", "language");
      invalidatePage("page-operations", "language");
      invalidatePage("page-run-results", "language");
    }
  };
  if (opts.deferWork) {
    const token = ++_langSwitchToken;
    afterNextPaint(() => {
      if (token !== _langSwitchToken) return;
      notifyLanguageChange();
      Promise.resolve(reRenderCurrentPage()).catch(() => {});
    });
  } else {
    notifyLanguageChange();
  }
  if (window.TaagerMonitoring) {
    window.TaagerMonitoring.setUiContext({
      activeRoute: window.__taagerActiveRoute || "",
      language: lang,
      theme: window._kbotTheme || "",
    });
  }
}

// Cache DOM refs — avoids getElementById on every topbar update
let _topBarName = null, _topBarDays = null, _topBarAvatar = null, _topBarAccounts = null, _topBarCopyBtn = null;
function updateTopBarText() {
  if (!_topBarName)     _topBarName     = document.getElementById("top-bar-name");
  if (!_topBarDays)     _topBarDays     = document.getElementById("top-bar-days");
  if (!_topBarAvatar)   _topBarAvatar   = document.getElementById("top-bar-avatar");
  if (!_topBarAccounts) _topBarAccounts = document.getElementById("top-bar-accounts");
  if (!_topBarCopyBtn) {
    _topBarCopyBtn = document.getElementById("btn-copy-license");
    if (_topBarCopyBtn) {
      _topBarCopyBtn.addEventListener("click", () => {
        const licKey = (window._kbotUser || {}).licenseKey || '';
        if (licKey) {
          navigator.clipboard.writeText(licKey).then(() => {
            const originalTooltip = _topBarCopyBtn.getAttribute("data-tooltip");
            const copiedText = window._t("titlebar.copied") || "Copied!";
            
            _topBarCopyBtn.setAttribute("data-tooltip", copiedText);
            _topBarCopyBtn.setAttribute("aria-label", copiedText);
            if (_topBarCopyBtn.dataset) delete _topBarCopyBtn.dataset.taagerTooltipReady;
            
            if (window.TaagerTooltip) {
              window.TaagerTooltip.hide();
              setTimeout(() => {
                if (document.activeElement === _topBarCopyBtn || _topBarCopyBtn.matches(":hover")) {
                  if (window.TaagerTooltip.init) window.TaagerTooltip.init();
                }
              }, 50);
            }
            
            if (window.TaagerUI && window.TaagerUI.toast) {
              window.TaagerUI.toast(copiedText, { kind: "success", timeout: 2000 });
            }
            
            setTimeout(() => {
              _topBarCopyBtn.setAttribute("data-tooltip", originalTooltip);
              _topBarCopyBtn.setAttribute("aria-label", originalTooltip);
              if (_topBarCopyBtn.dataset) delete _topBarCopyBtn.dataset.taagerTooltipReady;
            }, 2000);
          }).catch(err => {
            console.error("Failed to copy license key:", err);
          });
        }
      });
    }
  }

  if (!_topBarName) return;

  if (_topBarCopyBtn) {
    const licKey = (window._kbotUser || {}).licenseKey || '';
    if (licKey) {
      _topBarCopyBtn.style.display = "inline-flex";
      const label = window._t("titlebar.copy_license") || "Copy License";
      _topBarCopyBtn.setAttribute("data-tooltip", `${label}: ${licKey}`);
      _topBarCopyBtn.setAttribute("aria-label", `${label}: ${licKey}`);
      if (_topBarCopyBtn.dataset) delete _topBarCopyBtn.dataset.taagerTooltipReady;
    } else {
      _topBarCopyBtn.style.display = "none";
    }
  }

  const { customerName, daysLeft } = window._kbotUser;
  const welcomeFn = window._t("topbar.welcome");
  _topBarName.textContent = typeof welcomeFn === "function" ? welcomeFn(customerName) : welcomeFn;
  const daysFn = window._t("topbar.days");
  _topBarDays.textContent = typeof daysFn === "function" ? daysFn(daysLeft) : "";
  _topBarDays.classList.toggle("warn", daysLeft !== null && daysLeft <= 7);
  if (typeof window.showLicenseExpiryWarning === "function") {
    window.showLicenseExpiryWarning({
      daysLeft,
      licenseKey: (window._kbotUser || {}).licenseKey || "",
    });
  }

  // Show accounts badge if license allows more than 1
  const maxAcc = window._maxAccounts || 1;
  if (_topBarAccounts) {
    if (maxAcc > 1) {
      const licFn = window._t("setup.license_max");
      _topBarAccounts.textContent = typeof licFn === "function" ? licFn(maxAcc) : (maxAcc + " accounts");
      _topBarAccounts.style.display = "block";
    } else {
      _topBarAccounts.style.display = "none";
    }
  }

  if (_topBarAvatar && customerName) {
    const parts = customerName.trim().split(" ");
    _topBarAvatar.textContent = parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : customerName.slice(0, 2).toUpperCase();
  }

  const syncLbl = document.querySelector('#btn-admin-refresh .refresh-label');
  if (syncLbl) syncLbl.textContent = window._t('titlebar.sync');
  const clearCacheLbl = document.querySelector('#btn-clear-cache .clear-cache-label');
  if (clearCacheLbl) clearCacheLbl.textContent = window._t('titlebar.clear_cache');

  const localizedTooltips = [
    ["btn-admin-refresh", "titlebar.sync_tooltip"],
    ["btn-clear-cache", "titlebar.clear_cache_tooltip"],
    ["toggle-lang", "titlebar.lang_tooltip"],
    ["toggle-theme", "titlebar.theme_tooltip"],
    ["btn-zoom-out", "titlebar.zoom_out"],
    ["btn-zoom-reset", "titlebar.zoom_reset"],
    ["btn-zoom-in", "titlebar.zoom_in"],
    ["btn-minimize", "titlebar.minimize"],
    ["btn-maximize", "titlebar.maximize"],
    ["btn-close", "titlebar.close"],
  ];
  localizedTooltips.forEach(([id, key]) => {
    const node = document.getElementById(id);
    if (!node) return;
    const text = window._t(key);
    node.setAttribute("aria-label", text);
    node.setAttribute("data-tooltip", text);
    if (node.dataset) delete node.dataset.taagerTooltipReady;
  });
  const themeLabel = document.querySelector(".tb-theme-switch");
  if (themeLabel) {
    themeLabel.setAttribute("data-tooltip", window._t("titlebar.theme_tooltip"));
    if (themeLabel.dataset) delete themeLabel.dataset.taagerTooltipReady;
  }
  const zoomGroup = document.querySelector(".tb-zoom-control");
  if (zoomGroup) zoomGroup.setAttribute("aria-label", window._t("titlebar.zoom_group"));
  if (window.TaagerUI) window.TaagerUI.enhance(document.querySelector(".titlebar") || document);
}

const APP_ZOOM_LEVELS = [75, 90, 100, 110, 125, 150];

function updateAppZoomDisplay(percent) {
  const normalized = APP_ZOOM_LEVELS.includes(Number(percent)) ? Number(percent) : 100;
  const value = document.getElementById("btn-zoom-reset");
  const out = document.getElementById("btn-zoom-out");
  const zoomIn = document.getElementById("btn-zoom-in");
  if (value) value.textContent = normalized + "%";
  if (out) out.disabled = normalized === APP_ZOOM_LEVELS[0];
  if (zoomIn) zoomIn.disabled = normalized === APP_ZOOM_LEVELS[APP_ZOOM_LEVELS.length - 1];
}

function installAppZoomShortcuts() {
  let lastWheelZoomAt = 0;
  document.addEventListener("keydown", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.key === "0") {
      event.preventDefault();
      window.api.resetAppZoom();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      window.api.increaseAppZoom();
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      window.api.decreaseAppZoom();
    }
  });
  document.addEventListener("wheel", (event) => {
    if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
    event.preventDefault();
    const now = Date.now();
    if (now - lastWheelZoomAt < 80) return;
    lastWheelZoomAt = now;
    if (event.deltaY < 0) window.api.increaseAppZoom();
    else window.api.decreaseAppZoom();
  }, { passive: false });
}

// ── Top bar visibility ──
const PAGES_WITH_TOPBAR = new Set(["page-setup", "page-run", "page-results", "page-run-results", "page-license", "page-analytics", "page-operations", "page-dashboard", "page-notifications", "page-ai-intelligence"]);

const FEATURE_SCRIPT_GROUPS = {
  analytics: [
    "pages/analytics/chart.umd.min.js",
    "../../node_modules/xlsx/dist/xlsx.full.min.js",
    "locales/ar/analytics.js",
    "locales/en/analytics.js",
    "locales/ar/operations.js",
    "locales/en/operations.js",
    "page-i18n.js",
    "pages/guided-tour.js",
    "pages/premium-preview.js",
    "pages/taager-product-names.js",
    "pages/taager-status.js",
    "pages/smart-insights-core.js",
    "pages/analytics/analytics-charts.js",
    "pages/analytics/analytics-kpis.js",
    "pages/analytics/analytics-table.js",
    "pages/analytics/analytics-insights.js",
    "pages/analytics/analytics.js",
  ],
  operations: [
    "locales/ar/analytics.js",
    "locales/en/analytics.js",
    "locales/ar/operations.js",
    "locales/en/operations.js",
    "page-i18n.js",
    "pages/guided-tour.js",
    "pages/premium-preview.js",
    "pages/taager-status.js",
    "pages/smart-insights-core.js",
    "pages/operations/operations-utils.js",
    "pages/operations/operations-monitor.js",
    "pages/operations/operations-history.js",
    "pages/operations/operations-presets.js",
    "pages/operations/operations-insights.js",
    "pages/operations/operations.js",
  ],
  runResults: [
    "../../node_modules/xlsx/dist/xlsx.full.min.js",
    "locales/ar/analytics.js",
    "locales/en/analytics.js",
    "locales/ar/operations.js",
    "locales/en/operations.js",
    "page-i18n.js",
    "pages/guided-tour.js",
    "pages/premium-preview.js",
    "pages/taager-status.js",
    "pages/run-results.js",
  ],
  ai: [
    "pages/taager-product-names.js",
    "pages/taager-status.js",
    "pages/smart-insights-core.js",
    "pages/dashboard/dashboard-financial-core.js",
    "pages/dashboard/dashboard-campaign-decision.js",
    "pages/dashboard/dashboard-ai-shared.js",
    "pages/ai-intelligence/ai-intelligence-data.js",
    "pages/ai-intelligence/engine/intent-detector.js",
    "pages/ai-intelligence/engine/analytics-engine.js",
    "pages/ai-intelligence/engine/context-compressor.js",
    "pages/ai-intelligence/engine/session-memory.js",
    "pages/ai-intelligence/engine/local-reasoning-engine.js",
    "pages/ai-intelligence/engine/scenario-database.js",
    "pages/ai-intelligence/engine/business-orchestrator.js",
    "pages/dashboard/dashboard-ai-context.js",
    "pages/dashboard/dashboard-ai-mirror.js",
    "pages/ai-intelligence/ai-intelligence.js",
  ],
  dashboard: [
    "pages/guided-tour.js",
    "pages/premium-preview.js",
    "pages/taager-product-names.js",
    "pages/taager-status.js",
    "pages/smart-insights-core.js",
    "pages/dashboard/locales/ar/dashboard-locale.js",
    "pages/dashboard/locales/en/dashboard-locale.js",
    "pages/dashboard/dashboard-i18n.js",
    "pages/dashboard/dashboard-currency-core.js",
    "pages/dashboard/dashboard-financial-core.js",
    "pages/dashboard/dashboard-country-atlas.js",
    "pages/dashboard/dashboard-product-attribution-core.js",
    "pages/dashboard/dashboard-campaign-decision.js",
    "pages/dashboard/dashboard-aggregator.js",
    "pages/dashboard/dashboard-aggregator-score.js",
    "pages/dashboard/dashboard-aggregator-geo.js",
    "pages/dashboard/dashboard-insight-engine.js",
    "pages/dashboard/dashboard-best-ndr-cycle.js",
    "pages/dashboard/dashboard-filter-bus.js",
    "pages/dashboard/dashboard-query-runtime.js",
    "pages/dashboard/dashboard-shared.js",
    "pages/dashboard/sections/section-insight-strip.js",
    "pages/dashboard/dashboard-shell.js",
    "pages/dashboard/dashboard.js",
  ],
  dashboardMaster: [
    "pages/dashboard/sections/section8-master.js",
  ],
  dashboardCharts: [
    "pages/analytics/chart.umd.min.js",
  ],
  dashboardProducts: [
    "pages/smart-insights-core.js",
    "pages/dashboard/dashboard-financial-core.js",
    "pages/dashboard/sections/section5-products.js",
  ],
  dashboardProductsHydrated: [
    "pages/dashboard/sections/section5-products-hydrated.js",
  ],
  dashboardCampaigns: [
    "pages/dashboard/sections/section-campaigns.js",
  ],
  dashboardCampaignsHydrated: [
    "pages/smart-insights-core.js",
    "pages/dashboard/dashboard-financial-core.js",
    "pages/dashboard/dashboard-campaign-decision.js",
    "pages/dashboard/dashboard-campaign-query-core.js",
    "pages/dashboard/dashboard-campaign-intelligence.js",
    "pages/dashboard/sections/section-campaigns-hydrated.js",
  ],
  dashboardDailyPerformance: [
    "pages/dashboard/sections/section-daily-performance.js",
  ],
  dashboardDailyPerformanceHydrated: [
    "pages/dashboard/dashboard-financial-core.js",
    "pages/dashboard/sections/section-daily-performance-hydrated.js",
  ],
  dashboardOverview: ["pages/dashboard/sections/section1-overview.js"],
  dashboardPipeline: ["pages/dashboard/sections/section2-pipeline.js"],
  dashboardOrders: ["pages/dashboard/sections/section3-orders.js"],
  dashboardOrdersHydrated: ["pages/dashboard/sections/section3-orders-hydrated.js"],
  dashboardOrderSources: ["pages/dashboard/sections/section-order-sources.js"],
  dashboardProductSources: ["pages/dashboard/sections/section-product-sources.js"],
  dashboardOrdersExport: ["../../node_modules/xlsx/dist/xlsx.full.min.js"],
  dashboardCod: [
    "pages/dashboard/sections/section4-cod.js",
  ],
  dashboardCodHydrated: [
    "pages/smart-insights-core.js",
    "pages/dashboard/dashboard-country-atlas.js",
    "pages/dashboard/sections/section-city-drawer.js",
    "pages/dashboard/sections/section4-cod-hydrated.js",
  ],
  dashboardCommission: [
    "pages/dashboard/sections/section6-commission.js",
  ],
  dashboardCommissionHydrated: [
    "pages/analytics/chart.umd.min.js",
    "pages/dashboard/sections/section6-commission-hydrated.js",
  ],
  dashboardMarketing: ["pages/dashboard/sections/section-marketing-connections.js"],
  dashboardMarketingHydrated: ["pages/dashboard/sections/section-marketing-connections-hydrated.js"],
  dashboardCalculator: [
    "pages/dashboard/sections/section7-calculator.js",
  ],
  dashboardCalculatorHydrated: [
    "pages/analytics/chart.umd.min.js",
    "pages/smart-insights-core.js",
    "pages/dashboard/dashboard-financial-core.js",
    "pages/dashboard/sections/section7-calculator-hydrated.js",
  ],
  dashboardGmvTarget: [
    "pages/dashboard/dashboard-financial-core.js",
    "pages/dashboard/sections/section-gmv-target.js",
  ],
  dashboardCities: [
    "pages/dashboard/sections/section-cities.js",
  ],
  dashboardCitiesHydrated: [
    "pages/dashboard/dashboard-country-atlas.js",
    "pages/dashboard/sections/section-product-matrix.js",
    "pages/dashboard/sections/section-city-drawer.js",
    "pages/dashboard/sections/section-cities-hydrated.js",
  ],
  dashboardPrepaid: ["pages/dashboard/sections/section-prepaid.js"],
  dashboardPrepaidHydrated: ["pages/smart-insights-core.js", "pages/dashboard/sections/section-prepaid-hydrated.js"],
  dashboardForecast: ["pages/dashboard/sections/section9-product-forecast.js"],
  dashboardForecastHydrated: ["pages/smart-insights-core.js", "pages/dashboard/dashboard-financial-core.js", "pages/dashboard/sections/section9-product-forecast-hydrated.js"],
  dashboardNotifications: ["pages/notifications.js"],
  dashboardStaticUpdate: [
    "../../node_modules/xlsx/dist/xlsx.full.min.js",
    "pages/dashboard/sections/section-static-update.js",
  ],
  dashboardAi: [
    "pages/dashboard/dashboard-financial-core.js",
    "pages/dashboard/dashboard-campaign-decision.js",
    "pages/dashboard/dashboard-campaign-intelligence.js",
    "pages/dashboard/dashboard-ai-shared.js",
    "pages/dashboard/dashboard-ai-context.js",
    "pages/dashboard/dashboard-ai-mirror.js",
    "pages/dashboard/dashboard-ai-ui.js",
    "pages/ai-intelligence/ai-intelligence-data.js",
    "pages/ai-intelligence/engine/session-memory.js",
    "pages/dashboard/sections/section-taager-ai.js",
  ],
  dashboardAiChat: [
    "pages/ai-intelligence/engine/intent-detector.js",
    "pages/ai-intelligence/engine/analytics-engine.js",
    "pages/ai-intelligence/engine/context-compressor.js",
    "pages/ai-intelligence/engine/local-reasoning-engine.js",
    "pages/ai-intelligence/engine/scenario-database.js",
    "pages/ai-intelligence/engine/business-orchestrator.js",
  ],
};

const _loadedFeatureScripts = new Set();
const _featureLoadPromises = new Map();
const _preloadedFeatureScripts = new Set();
const _preloadedFeatureStyles = new Set();
const _loadedFeatureStyles = new Set();
const _featureStylePromises = new Map();
const _featureRouteTokens = new Map();
let _featurePrewarmStarted = false;

function keepVisualSystemLast() {
  const visualSystem = document.querySelector('link[data-visual-system="true"]');
  if (visualSystem && visualSystem !== document.head.lastElementChild) {
    document.head.appendChild(visualSystem);
  }
}

const FEATURE_STYLE_GROUPS = {
  analytics: ["styles/analytics.css"],
  operations: ["styles/operations.css"],
  runResults: ["styles/run-results.css"],
  ai: ["pages/ai-intelligence/ai-intelligence.css"],
  dashboard: [
    "styles/analytics.css",
    "pages/dashboard/dashboard-styles.css",
  ],
  dashboardOverview: ["pages/dashboard/dashboard-overview.css"],
  dashboardPipeline: ["pages/dashboard/dashboard-pipeline.css"],
  dashboardOrders: ["pages/dashboard/dashboard-orders.css"],
  dashboardOrderSources: ["pages/dashboard/dashboard-order-sources.css"],
  dashboardProductSources: ["pages/dashboard/dashboard-product-sources.css"],
  dashboardCod: ["pages/dashboard/dashboard-cod.css"],
  dashboardProducts: ["pages/dashboard/dashboard-products.css"],
  dashboardCities: ["pages/dashboard/dashboard-cities.css"],
  dashboardCommission: ["pages/dashboard/dashboard-master-commission.css"],
  dashboardMaster: ["pages/dashboard/dashboard-master-commission.css"],
  dashboardMarketing: ["pages/dashboard/dashboard-marketing.css"],
  dashboardCampaigns: ["pages/dashboard/dashboard-campaigns.css"],
  dashboardDailyPerformance: ["pages/dashboard/dashboard-daily-performance.css"],
  dashboardCalculator: ["pages/dashboard/dashboard-calculator.css"],
  dashboardGmvTarget: ["pages/dashboard/dashboard-gmv-target.css"],
  dashboardForecast: ["pages/dashboard/dashboard-forecast.css"],
  dashboardAi: [
    "pages/dashboard/dashboard-ai.css",
    "pages/ai-intelligence/ai-intelligence.css",
  ],
};

function loadStylesheetOnce(href) {
  if (_loadedFeatureStyles.has(href)) return Promise.resolve();
  if (_featureStylePromises.has(href)) return _featureStylePromises.get(href);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => {
      _loadedFeatureStyles.add(href);
      keepVisualSystemLast();
      resolve();
    };
    link.onerror = () => reject(new Error("Failed to load " + href));
    document.head.appendChild(link);
  });
  _featureStylePromises.set(href, promise);
  return promise;
}

function loadScriptOnce(src) {
  if (_loadedFeatureScripts.has(src)) return Promise.resolve();
  if (_featureLoadPromises.has(src)) return _featureLoadPromises.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      _loadedFeatureScripts.add(src);
      if (typeof window.disableDashboardChartMotion === "function") {
        window.disableDashboardChartMotion();
      }
      resolve();
    };
    script.onerror = () => {
      if (src.indexOf("xlsx") !== -1 && !window.XLSX && typeof require === "function") {
        try {
          window.XLSX = require("xlsx");
          _loadedFeatureScripts.add(src);
          resolve();
          return;
        } catch (_) {}
      }
      reject(new Error("Failed to load " + src));
    };
    document.body.appendChild(script);
  });
  _featureLoadPromises.set(src, promise);
  return promise;
}

function preloadScriptResource(src) {
  if (_loadedFeatureScripts.has(src) || _preloadedFeatureScripts.has(src)) return;
  _preloadedFeatureScripts.add(src);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "script";
  link.href = src;
  document.head.appendChild(link);
}

function preloadStyleResource(href) {
  if (_loadedFeatureStyles.has(href) || _preloadedFeatureStyles.has(href)) return;
  _preloadedFeatureStyles.add(href);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "style";
  link.href = href;
  document.head.appendChild(link);
}

function preloadFeatureResources(feature) {
  (FEATURE_STYLE_GROUPS[feature] || []).forEach(preloadStyleResource);
  (FEATURE_SCRIPT_GROUPS[feature] || []).forEach(preloadScriptResource);
}

async function ensureFeatureScripts(feature) {
  const perfTimer = TaagerPerf.start("feature:" + feature + ":ensure", {
    feature,
    styles: (FEATURE_STYLE_GROUPS[feature] || []).length,
    scripts: (FEATURE_SCRIPT_GROUPS[feature] || []).length
  });
  const styles = FEATURE_STYLE_GROUPS[feature] || [];
  try {
    const stylePromise = Promise.all(styles.map((href) => loadStylesheetOnce(href)));
    const scripts = FEATURE_SCRIPT_GROUPS[feature] || [];
    scripts.forEach(preloadScriptResource);
    for (const src of scripts) {
      await loadScriptOnce(src);
    }
    await stylePromise;
    keepVisualSystemLast();
    TaagerPerf.end(perfTimer, { ok: true });
  } catch (err) {
    TaagerPerf.end(perfTimer, { ok: false, error: err && err.message ? err.message : String(err || "") });
    throw err;
  }
}

window.ensureFeatureScripts = ensureFeatureScripts;

const DASHBOARD_SECTION_FEATURES = {
  master: "dashboardMaster",
  overview: "dashboardOverview",
  pipeline: "dashboardPipeline",
  orders: "dashboardOrders",
  orderSources: "dashboardOrderSources",
  productSources: "dashboardProductSources",
  cod: "dashboardCod",
  products: "dashboardProducts",
  cities: "dashboardCities",
  commission: "dashboardCommission",
  marketing: "dashboardMarketing",
  campaigns: "dashboardCampaigns",
  dailyPerformance: "dashboardDailyPerformance",
  calculator: "dashboardCalculator",
  gmvTarget: "dashboardGmvTarget",
  productForecast: "dashboardForecast",
  prepaid: "dashboardPrepaid",
  notifications: "dashboardNotifications",
  staticUpdate: "dashboardStaticUpdate",
  taagerAi: "dashboardAi",
};

window.ensureDashboardSection = function ensureDashboardSection(sectionId) {
  return ensureFeatureScripts(DASHBOARD_SECTION_FEATURES[sectionId] || "dashboard");
};

const DASHBOARD_INTERACTIVE_FEATURES = [
  "dashboardMaster",
  "dashboardOverview",
  "dashboardPipeline",
  "dashboardOrders",
  "dashboardOrdersHydrated",
  "dashboardOrderSources",
  "dashboardProductSources",
  "dashboardCod",
  "dashboardCodHydrated",
  "dashboardProducts",
  "dashboardProductsHydrated",
  "dashboardCities",
  "dashboardCitiesHydrated",
  "dashboardCommission",
  "dashboardCommissionHydrated",
  "dashboardMarketing",
  "dashboardMarketingHydrated",
  "dashboardCampaigns",
  "dashboardCampaignsHydrated",
  "dashboardDailyPerformance",
  "dashboardDailyPerformanceHydrated",
  "dashboardCalculator",
  "dashboardCalculatorHydrated",
  "dashboardGmvTarget",
  "dashboardForecast",
  "dashboardForecastHydrated",
  "dashboardPrepaid",
  "dashboardPrepaidHydrated",
  "dashboardStaticUpdate",
  "dashboardAi",
];

window.preloadDashboardSectionResources = function preloadDashboardSectionResources() {
  DASHBOARD_INTERACTIVE_FEATURES.forEach(preloadFeatureResources);
};

let _dashboardInteractivePreparePromise = null;
window.prepareDashboardSections = function prepareDashboardSections() {
  if (_dashboardInteractivePreparePromise) return _dashboardInteractivePreparePromise;
  window.preloadDashboardSectionResources();
  const startedAt = performance.now();
  taagerDebugLog("dashboard-route", "interactive-sections:prepare-start", {
    featureCount: DASHBOARD_INTERACTIVE_FEATURES.length
  });
  const results = [];
  const waitForIdlePreparationSlot = () => new Promise((resolve) => {
    const run = () => resolve();
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 750 });
    else setTimeout(run, 0);
  });
  // Parse section bundles one group at a time during idle windows. Starting all
  // groups together competes with aggregation and makes the dashboard entrance
  // slower even though later section switches benchmark well.
  _dashboardInteractivePreparePromise = DASHBOARD_INTERACTIVE_FEATURES.reduce((chain, feature) =>
    chain.then(waitForIdlePreparationSlot).then(() =>
      ensureFeatureScripts(feature).then(() => {
        results.push({ feature, ok: true });
      }).catch((error) => {
        taagerDebugLog("dashboard-route", "interactive-section:prepare-failed", {
          feature,
          error: error && error.message ? error.message : String(error || "")
        }, "warn");
        results.push({ feature, ok: false });
      })
    ), Promise.resolve()
  ).then(() => {
    window._dashboardInteractiveSectionsReady = true;
    taagerDebugLog("dashboard-route", "interactive-sections:prepare-done", {
      elapsedMs: Math.round(performance.now() - startedAt),
      failed: results.filter((item) => !item.ok).map((item) => item.feature)
    });
    return results;
  });
  return _dashboardInteractivePreparePromise;
};

window.TaagerDashboardEagerPrewarm = false;
let _dashboardSectionPrewarmStarted = false;
window.prewarmDashboardSections = function prewarmDashboardSections() {
  if (window.TaagerDashboardEagerPrewarm !== true) {
    taagerDebugLog("dashboard-route", "section-prewarm:disabled", {
      reason: "dashboard sections stay lazy until opened"
    });
    return;
  }
  if (_dashboardSectionPrewarmStarted) return;
  _dashboardSectionPrewarmStarted = true;
  const queue = [
      "dashboardOverview",
      "dashboardPipeline",
      "dashboardOrders",
      "dashboardOrderSources",
      "dashboardProductSources",
      "dashboardCod",
      "dashboardProducts",
      "dashboardCommission",
      "dashboardPrepaid",
      "dashboardCities",
      "dashboardCampaigns",
      "dashboardDailyPerformance",
      "dashboardCalculator",
      "dashboardGmvTarget",
      "dashboardForecast",
      "dashboardMarketing",
    ];
  const scheduleNext = () => {
    if (!queue.length) return;
    const run = (deadline) => {
      const phase = window.__taagerPerfLastPhase;
      const inputPending = navigator.scheduling && typeof navigator.scheduling.isInputPending === "function" && navigator.scheduling.isInputPending();
      if (inputPending || (phase && phase.state === "running") || (deadline && !deadline.didTimeout && deadline.timeRemaining() < 8)) {
        scheduleNext();
        return;
      }
      const feature = queue.shift();
      ensureFeatureScripts(feature).catch(() => {}).finally(scheduleNext);
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(() => run(null), 400);
  };
  scheduleNext();
};

function nextFeatureRouteToken(feature) {
  const token = (_featureRouteTokens.get(feature) || 0) + 1;
  _featureRouteTokens.set(feature, token);
  return token;
}

function isLatestFeatureRoute(feature, token) {
  return _featureRouteTokens.get(feature) === token;
}

function isActivePage(pageId) {
  return document.querySelector(".page.active")?.id === pageId;
}

function scheduleFeaturePrewarm(preferredFeature) {
  if (_featurePrewarmStarted) return;
  _featurePrewarmStarted = true;
  const features = [preferredFeature, "dashboard", "analytics", "operations"]
    .filter(Boolean)
    .filter((feature, index, arr) => arr.indexOf(feature) === index);
  const start = () => {
    let chain = Promise.resolve();
    features.forEach((feature) => {
      chain = chain.then(() => ensureFeatureScripts(feature).catch((err) => {
        console.warn("[Router] Feature prewarm failed:", feature, err?.message || err);
      }));
    });
  };
  if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 350);
}

function primeLikelyFeatureRoutes(preferredFeature) {
  [preferredFeature, "dashboard", "analytics", "operations"]
    .filter(Boolean)
    .filter((feature, index, arr) => arr.indexOf(feature) === index)
    .forEach(preloadFeatureResources);
}

const _pageLifecycle = new Map();
const APP_RELOAD_RESTORE_KEY = "taager-app-reload-restore-v1";

function pageLifecycle(pageId) {
  if (!_pageLifecycle.has(pageId)) {
    _pageLifecycle.set(pageId, { mounted: false, active: false, invalid: false, reason: "", mountedAt: 0 });
  }
  return _pageLifecycle.get(pageId);
}

function markPageMounted(pageId) {
  const state = pageLifecycle(pageId);
  state.mounted = true;
  state.invalid = false;
  state.reason = "";
  state.mountedAt = Date.now();
}

function invalidatePage(pageId, reason) {
  const state = pageLifecycle(pageId);
  state.invalid = true;
  state.reason = reason || "data";
}

function canWarmActivate(pageId) {
  const state = pageLifecycle(pageId);
  const page = document.getElementById(pageId);
  return !!(state.mounted && !state.invalid && page && page.children.length);
}

function activeDashboardSection() {
  const mount = document.getElementById("db-shell-mount");
  const section = mount && mount._dashboardActiveSection;
  return typeof section === "string" && section ? section : "";
}

function captureAppReloadRestoreState(reason) {
  const activePage = document.querySelector(".page.active");
  const state = {
    pageId: activePage && activePage.id ? activePage.id : _activePageId || "",
    dashboardSection: activeDashboardSection(),
    setupStep: window._setupCurrentStep || "",
    reason: reason || "reload",
    ts: Date.now(),
  };
  try {
    sessionStorage.setItem(APP_RELOAD_RESTORE_KEY, JSON.stringify(state));
  } catch (_) {}
  return state;
}

function consumeAppReloadRestoreState() {
  let parsed = null;
  try {
    parsed = JSON.parse(sessionStorage.getItem(APP_RELOAD_RESTORE_KEY) || "null");
    sessionStorage.removeItem(APP_RELOAD_RESTORE_KEY);
  } catch (_) {
    try { sessionStorage.removeItem(APP_RELOAD_RESTORE_KEY); } catch (__) {}
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (Date.now() - Number(parsed.ts || 0) > 5 * 60 * 1000) return null;
  return parsed;
}

function reloadAppPreservingRoute(reason) {
  captureAppReloadRestoreState(reason);
  window.location.reload();
}

window.addEventListener("beforeunload", function () {
  captureAppReloadRestoreState("window-reload");
});

function routeAfterCredentialsReady(creds, restoreState) {
  const hasAccounts = creds && creds.accounts && creds.accounts.length > 0;
  const hasRunnableAccounts = hasAccounts && creds.accounts.some(account => account && account.accountType !== "static");
  const restorePage = restoreState && restoreState.pageId;

  if (restorePage === "page-dashboard" && hasAccounts && window._dashboardEnabled) {
    if (restoreState.dashboardSection) window._dashboardInitialSection = restoreState.dashboardSection;
    goToDashboard();
    return;
  }

  if (restorePage === "page-analytics" && hasAccounts && window._analyticsEnabled && !window._teamLeaderEnabled) {
    goToAnalytics();
    return;
  }

  if (restorePage === "page-operations" && hasAccounts && window._operationsEnabled && !window._teamLeaderEnabled) {
    goToOperations();
    return;
  }

  if (restorePage === "page-run-results" && hasAccounts && window._operationsEnabled && !window._teamLeaderEnabled) {
    goToRunResults();
    return;
  }

  if (restorePage === "page-notifications" && hasAccounts) {
    goToNotifications();
    return;
  }

  if (restorePage === "page-ai-intelligence" && hasAccounts && window._dashboardEnabled) {
    goToAiIntelligence();
    return;
  }

  if (restorePage === "page-setup" && !window._teamLeaderEnabled) {
    const restoredSetupStep = restoreState.setupStep || (hasRunnableAccounts ? "run" : "accounts");
    if (!hasRunnableAccounts && restoredSetupStep === "run") goToDashboard();
    else goToSetup(restoredSetupStep);
    return;
  }

  if ((window._teamLeaderEnabled || !hasRunnableAccounts) && hasAccounts) goToDashboard();
  else goToSetup(hasAccounts ? "run" : "accounts");
}

function activatePage(pageId) {
  const state = pageLifecycle(pageId);
  state.active = true;
  const page = document.getElementById(pageId);
  if (page && typeof page._taagerActivate === "function") page._taagerActivate();
}

function deactivatePage(pageId) {
  const state = pageLifecycle(pageId);
  state.active = false;
  const page = document.getElementById(pageId);
  if (page && typeof page._taagerDeactivate === "function") page._taagerDeactivate();
}

window.TaagerPageLifecycle = {
  markMounted: markPageMounted,
  invalidate: invalidatePage,
  activate: activatePage,
  deactivate: deactivatePage,
  state: pageLifecycle,
  canWarmActivate,
};

const TaagerPerf = (() => {
  const MAX_ENTRIES = 400;
  const entries = [];
  const openTimers = new Map();
  let interactionProbeInstalled = false;
  let longTaskObserver = null;

  function now() {
    return window.performance && typeof window.performance.now === "function"
      ? window.performance.now()
      : Date.now();
  }

  function enabled() {
    try {
      return window.__TAAGER_PERF_DIAGNOSTICS === true ||
        localStorage.getItem("taager-perf") === "1" ||
        /(?:\?|&)taagerPerf=1\b/.test(window.location.search || "");
    } catch (_) {
      return window.__TAAGER_PERF_DIAGNOSTICS === true;
    }
  }

  function push(entry) {
    const next = Object.assign({ at: Date.now() }, entry || {});
    entries.push(next);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    if (enabled() && next.type === "measure") {
      console.debug("[TaagerPerf]", next.name, Math.round(next.durationMs * 10) / 10 + "ms", next.detail || "");
    }
    return next;
  }

  function mark(name, detail) {
    if (!name) return "";
    if (window.performance && typeof window.performance.mark === "function") {
      try { window.performance.mark(name); } catch (_) {}
    }
    push({ type: "mark", name, time: now(), detail: detail || null });
    return name;
  }

  function readMarkTime(name) {
    if (!name || !window.performance || typeof window.performance.getEntriesByName !== "function") return null;
    try {
      const matches = window.performance.getEntriesByName(name, "mark");
      return matches.length ? matches[matches.length - 1].startTime : null;
    } catch (_) {
      return null;
    }
  }

  function measure(name, startMark, endMark, detail) {
    if (!name) return null;
    let duration = null;
    if (window.performance && typeof window.performance.measure === "function" && startMark) {
      try {
        window.performance.measure(name, startMark, endMark);
        if (typeof window.performance.getEntriesByName === "function") {
          const matches = window.performance.getEntriesByName(name, "measure");
          if (matches.length) duration = matches[matches.length - 1].duration;
        }
      } catch (_) {}
    }
    if (duration == null) {
      const start = readMarkTime(startMark);
      const end = endMark ? readMarkTime(endMark) : now();
      if (start != null && end != null) duration = Math.max(0, end - start);
    }
    if (duration == null) return null;
    return push({ type: "measure", name, durationMs: duration, detail: detail || null });
  }

  function start(name, detail) {
    const id = name + ":" + Date.now().toString(36) + ":" + Math.random().toString(36).slice(2, 7);
    openTimers.set(id, { name, startedAt: now(), detail: detail || null });
    mark(id + ":start", detail);
    return id;
  }

  function end(id, detail) {
    const timer = openTimers.get(id);
    if (!timer) return null;
    openTimers.delete(id);
    const endMark = id + ":end";
    mark(endMark, detail);
    return measure(timer.name, id + ":start", endMark, Object.assign({}, timer.detail || {}, detail || {}));
  }

  function afterPaint(name, detail) {
    const id = start(name, detail);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => end(id, { painted: true }));
    });
    return id;
  }

  function dump(filter) {
    const value = filter ? String(filter).toLowerCase() : "";
    const list = entries.filter((entry) => !value || String(entry.name || "").toLowerCase().indexOf(value) !== -1);
    if (typeof console.table === "function") console.table(list);
    else console.log("[TaagerPerf]", list);
    return list;
  }

  function clear() {
    entries.splice(0, entries.length);
    openTimers.clear();
    if (window.performance && typeof window.performance.clearMarks === "function") {
      try {
        window.performance.clearMarks();
        window.performance.clearMeasures();
      } catch (_) {}
    }
  }

  function snapshot(label) {
    const subscriptions = window.DashboardSubscriptionDiagnostics &&
      typeof window.DashboardSubscriptionDiagnostics.snapshot === "function"
      ? window.DashboardSubscriptionDiagnostics.snapshot()
      : {};
    const snap = {
      label: label || "snapshot",
      activeSection: (document.getElementById("db-shell-mount") || {})._dashboardActiveSection || "",
      nodeCount: document.getElementsByTagName("*").length,
      dashboardPaneChildren: (document.getElementById("dash-section-pane") || { children: [] }).children.length,
      usedHeap: window.performance && window.performance.memory ? window.performance.memory.usedJSHeapSize : null,
      subscriptions
    };
    push({ type: "snapshot", name: "stability:snapshot", detail: snap });
    if (enabled()) console.debug("[TaagerPerf] stability snapshot", snap);
    return snap;
  }

  async function runDashboardSectionStabilityCheck(sequence, rounds) {
    const mount = document.getElementById("db-shell-mount");
    if (!mount) throw new Error("Dashboard shell is not mounted.");
    const sections = Array.isArray(sequence) && sequence.length
      ? sequence
      : ["products", "cities", "orders", "productForecast", "calculator", "cod", "master"];
    const count = Math.max(1, Number(rounds) || 50);
    // Populate every pane exercised by the check before taking the baseline.
    // Otherwise a legitimate first-time COD/products pane can look like a leak,
    // especially at larger datasets where one cached pane exceeds 500 nodes.
    for (const section of sections.filter((value, index, values) => values.indexOf(value) === index)) {
      const warmButton = mount.querySelector('.dash-nav-btn[data-section="' + section + '"]');
      if (warmButton) warmButton.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    const baselineSection = mount._dashboardActiveSection || sections[sections.length - 1];
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = snapshot("before-" + count + "-section-switches");
    for (let i = 0; i < count; i += 1) {
      const section = sections[i % sections.length];
      const button = mount.querySelector('.dash-nav-btn[data-section="' + section + '"]');
      if (button) button.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    if (mount._dashboardActiveSection !== baselineSection) {
      const baselineButton = mount.querySelector('.dash-nav-btn[data-section="' + baselineSection + '"]');
      if (baselineButton) baselineButton.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = snapshot("after-" + count + "-section-switches");
    return { before, after, entries: dump("dashboard:section") };
  }

  function labelInteraction(target, eventType) {
    if (!target || !target.closest) return "";
    const inputMap = [
      ["#s5-search", "products:search-input"],
      ["#sc-fb-search", "cities:search-input"],
      ["#s3-search", "orders:search-input"],
      ["#s9-product-search", "productForecast:search-input"],
      ["#s7-in-budget", "calculator:budget-input"],
      [".s9-spend-input,.s9-sim-spend-input,.s9-total-orders-input,.s9-delivered-orders-input,.s9-ndr-input,.s9-comm-input", "productForecast:forecast-input"]
    ];
    const clickMap = [
      [".s5-pill,#s5-search-clear,.sc-pay-pill,#sc-fb-reset,#sc-fb-province,#sc-fb-product", "dashboard:filter-action"],
      [".s5-page-btn,#s5-prev-page,#s5-next-page,.s9-page-btn,.s9-page-prev,.s9-page-next,.s7-source-page-btn,.s7-source-page-prev,.s7-source-page-next", "dashboard:pagination-action"],
      [".s9-sort-btn,#s9-clear-sort,.s5-sort-option,.s5-sort-trigger,[data-sort]", "dashboard:sort-action"]
    ];
    const map = eventType === "input" || eventType === "change" ? inputMap : clickMap;
    for (const item of map) {
      if (target.closest(item[0])) return item[1];
    }
    return "";
  }

  function installDashboardInteractionProbe() {
    if (interactionProbeInstalled) return;
    interactionProbeInstalled = true;
    ["input", "change", "click"].forEach((eventType) => {
      document.addEventListener(eventType, (event) => {
        const label = labelInteraction(event.target, eventType);
        if (!label) return;
        afterPaint("interaction:" + label + ":to-paint", {
          eventType,
          section: (document.getElementById("db-shell-mount") || {})._dashboardActiveSection || ""
        });
      }, true);
    });
  }

  function installLongTaskObserver() {
    if (longTaskObserver || !window.PerformanceObserver) return;
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          push({
            type: "longtask",
            name: "renderer:longtask",
            durationMs: entry.duration,
            detail: {
              activeRoute: window.__taagerActiveRoute || "",
              activeSection: (document.getElementById("db-shell-mount") || {})._dashboardActiveSection || "",
              lastSectionPhase: window.__taagerPerfLastPhase || null
            }
          });
        });
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch (_) {}
  }

  const api = {
    mark,
    measure,
    start,
    end,
    afterPaint,
    dump,
    clear,
    snapshot,
    runDashboardSectionStabilityCheck,
    installDashboardInteractionProbe,
    installLongTaskObserver,
    entries: () => entries.slice(),
    enableLogs: () => {
      try { localStorage.setItem("taager-perf", "1"); } catch (_) {}
      window.__TAAGER_PERF_DIAGNOSTICS = true;
    },
    disableLogs: () => {
      try { localStorage.removeItem("taager-perf"); } catch (_) {}
      window.__TAAGER_PERF_DIAGNOSTICS = false;
    }
  };

  window.TaagerPerf = api;
  installDashboardInteractionProbe();
  installLongTaskObserver();
  return api;
})();

function perfMark(name, detail) {
  TaagerPerf.mark(name, detail);
}

function featureLoadingShell(title, body) {
  const esc = window.TaagerUI && window.TaagerUI.esc
    ? window.TaagerUI.esc
    : (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  return `
    <div class="sv3-shell route-loading-shell">
      <div class="route-loading-panel" role="status" aria-live="polite">
        <span class="taager-spinner" aria-hidden="true"></span>
        <div>
          <strong>${esc(title)}</strong>
          <span>${esc(body)}</span>
        </div>
      </div>
    </div>`;
}

function showFeatureLoadingPage(pageId, title, body) {
  const el = document.getElementById(pageId);
  if (!el) return;
  if (el.children.length && !el.querySelector(".route-loading-shell")) return;
  el.innerHTML = featureLoadingShell(title, body);
}

function showFeatureError(pageId, title, err) {
  const el = document.getElementById(pageId);
  if (!el) return;
  const msg = err && err.message ? err.message : String(err || "Unknown error");
  const esc = window.TaagerUI && window.TaagerUI.esc
    ? window.TaagerUI.esc
    : (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  el.innerHTML = `
    <div class="sv3-shell route-loading-shell">
      <div class="route-loading-panel route-loading-panel-error" role="alert">
        <div class="taager-state-icon" aria-hidden="true">!</div>
        <div>
          <strong>${esc(title)}</strong>
          <span>${esc(msg)}</span>
        </div>
      </div>
    </div>`;
}

window.renderDashboard = async function lazyRenderDashboard() {
  await ensureFeatureScripts("dashboard");
  if (window.renderDashboard !== lazyRenderDashboard && typeof window.renderDashboard === "function") {
    return window.renderDashboard.apply(window, arguments);
  }
};

window.renderAnalytics = async function lazyRenderAnalytics() {
  await ensureFeatureScripts("analytics");
  if (window.renderAnalytics !== lazyRenderAnalytics && typeof window.renderAnalytics === "function") {
    return window.renderAnalytics.apply(window, arguments);
  }
};

window.renderOperations = async function lazyRenderOperations() {
  await ensureFeatureScripts("operations");
  if (window.renderOperations !== lazyRenderOperations && typeof window.renderOperations === "function") {
    return window.renderOperations.apply(window, arguments);
  }
};

// Dismiss the preloader exactly once — on the first showPage() call.
// At this point a real page has been rendered into the DOM, so there
// is no black-screen gap between loader exit and content appearing.
let _preloaderDismissed = false;
function dismissPreloader() {
  if (_preloaderDismissed) {
    taagerDebugLog("preloader", "dismiss:skip-already-dismissed");
    return;
  }
  _preloaderDismissed = true;
  taagerDebugLog("preloader", "dismiss:start");
  const stabilizationLock = beginUiStabilization("preloader-dismiss");
  waitForStableUi({ quietMs: 120, maxWaitMs: 1800 }).then(() => {
    const preloader = document.getElementById("preloader");
    if (!preloader) {
      taagerDebugLog("preloader", "dismiss:no-dom-node");
      endUiStabilization(stabilizationLock);
      return;
    }
    taagerDebugLog("preloader", "dismiss:fade-out");
    preloader.style.transition = "opacity 0.25s ease";
    preloader.style.opacity = "0";
    setTimeout(() => {
      if (preloader.parentNode) preloader.remove();
      endUiStabilization(stabilizationLock);
      taagerDebugLog("preloader", "dismiss:removed");
    }, 260);
  });
}

function setPreloaderCopy(title, body) {
  const titleEl = document.getElementById("preloader-title");
  const bodyEl = document.getElementById("preloader-body");
  if (titleEl && title) titleEl.textContent = title;
  if (bodyEl && body) bodyEl.textContent = body;
}


const DASHBOARD_PRELOADER_STAGES = [
  { id: "engine", labelKey: "preloader.dashboard.stage.engine.label", label: "Dashboard engine", target: 14, bodyKey: "preloader.dashboard.stage.engine.body", body: "Loading dashboard code, styles, and controls." },
  { id: "snapshot", labelKey: "preloader.dashboard.stage.snapshot.label", label: "Saved snapshots", target: 30, bodyKey: "preloader.dashboard.stage.snapshot.body", body: "Reading saved account snapshots from this device." },
  { id: "accounts", labelKey: "preloader.dashboard.stage.accounts.label", label: "Accounts", target: 44, bodyKey: "preloader.dashboard.stage.accounts.body", body: "Matching accounts, countries, currencies, and date range." },
  { id: "metrics", labelKey: "preloader.dashboard.stage.metrics.label", label: "Metrics", target: 66, bodyKey: "preloader.dashboard.stage.metrics.body", body: "Preparing orders, revenue, profit, COD, and NDR metrics." },
  { id: "modules", labelKey: "preloader.dashboard.stage.modules.label", label: "Dashboard views", target: 80, bodyKey: "preloader.dashboard.stage.modules.body", body: "Building product, city, campaign, calculator, and master views." },
  { id: "marketing", labelKey: "preloader.dashboard.stage.marketing.label", label: "Marketing spend", target: 91, bodyKey: "preloader.dashboard.stage.marketing.body", body: "Checking connected marketing spend for the selected range." },
  { id: "rendering", labelKey: "preloader.dashboard.stage.rendering.label", label: "Rendering", target: 97, bodyKey: "preloader.dashboard.stage.rendering.body", body: "Rendering the final dashboard view." }
];

const DASHBOARD_PRELOADER_ACTIVITY_KEYS = {
  "Starting dashboard...": "preloader.dashboard.activity.starting",
  "Dashboard engine loaded": "preloader.dashboard.activity.engineLoaded",
  "Loading saved snapshot payload": "preloader.dashboard.activity.snapshotPayload",
  "Reading saved dashboard snapshots": "preloader.dashboard.activity.savedSnapshots",
  "Matching dashboard account scope": "preloader.dashboard.activity.accountScope",
  "Preparing dashboard metrics": "preloader.dashboard.activity.metrics",
  "Building dashboard views": "preloader.dashboard.activity.views",
  "Dashboard views prepared": "preloader.dashboard.activity.viewsPrepared",
  "Checking connected marketing spend": "preloader.dashboard.activity.marketing",
  "Syncing connected marketing spend": "preloader.dashboard.activity.marketingSync",
  "Checking cached marketing status": "preloader.dashboard.activity.marketingCached",
  "Rendering final dashboard": "preloader.dashboard.activity.rendering",
  "Dashboard ready.": "preloader.dashboard.activity.ready",
  "Dashboard opened with the best available data.": "preloader.dashboard.activity.bestData",
  "Dashboard metrics prepared": "preloader.dashboard.activity.metricsPrepared",
  "Preparing empty dashboard metrics": "preloader.dashboard.activity.emptyMetrics",
  "No saved account snapshot yet": "preloader.dashboard.activity.noSnapshot"
};

const _dashboardPreloaderState = {
  percent: 6,
  target: 6,
  stageId: "engine",
  activity: "Starting dashboard...",
  motionTimer: null,
  complete: false
};
let _dashboardSmoothTimers = [];
let _dashboardSmoothResolve = null;

function preloaderEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function preloaderText(key, fallback) {
  const value = window._t ? window._t(key) : key;
  return typeof value === "string" && value !== key ? value : (fallback || value || key);
}

function preloaderCall(key, fallback, value) {
  const translated = window._t ? window._t(key) : key;
  if (typeof translated === "function") return translated(value);
  return typeof translated === "string" && translated !== key ? translated : fallback;
}

function dashboardPreloaderStageLabel(stage) {
  return preloaderText(stage.labelKey, stage.label);
}

function dashboardPreloaderStageBody(stage) {
  return preloaderText(stage.bodyKey, stage.body);
}

function dashboardPreloaderActivityText(activity, fallbackBody) {
  const text = String(activity || "").trim();
  if (!text) return fallbackBody || "";
  let match = text.match(/^(\d+)\s+account snapshots loaded$/);
  if (match) return preloaderCall("preloader.dashboard.activity.accountSnapshotsLoaded", text, match[1]);
  match = text.match(/^(\d+)\s+rows in selected period$/);
  if (match) return preloaderCall("preloader.dashboard.activity.rowsSelected", text, match[1]);
  match = text.match(/^(\d+)\s+orders prepared$/);
  if (match) return preloaderCall("preloader.dashboard.activity.ordersPrepared", text, match[1]);
  const key = DASHBOARD_PRELOADER_ACTIVITY_KEYS[text];
  return key ? preloaderText(key, text) : text;
}

function dashboardPreloaderStageIndex(id) {
  return Math.max(0, DASHBOARD_PRELOADER_STAGES.findIndex((stage) => stage.id === id));
}

function dashboardPreloaderStage(id) {
  return DASHBOARD_PRELOADER_STAGES.find((stage) => stage.id === id) || DASHBOARD_PRELOADER_STAGES[0];
}

function dashboardPreloaderRoot() {
  return document.getElementById("dashboard-live-preloader");
}

function dashboardStagePercent(stage, index, activeIndex, totalPercent) {
  if (_dashboardPreloaderState.complete || index < activeIndex) return 100;
  if (index > activeIndex) return 0;
  const previousTarget = index > 0 ? Number(DASHBOARD_PRELOADER_STAGES[index - 1].target || 0) : 0;
  const stageTarget = Number(stage.target || previousTarget + 1);
  const localPercent = ((totalPercent - previousTarget) / Math.max(1, stageTarget - previousTarget)) * 100;
  return Math.max(1, Math.min(99, Math.round(localPercent)));
}

function updateDashboardPreloaderDom() {
  const root = dashboardPreloaderRoot();
  // The section loader is intentionally removed once dashboard content mounts.
  // Later data updates may still report stages, but they must remain state-only.
  if (!root) return false;
  const percent = Math.max(0, Math.min(100, Math.round(_dashboardPreloaderState.percent)));
  const stage = dashboardPreloaderStage(_dashboardPreloaderState.stageId);
  const percentEl = root.querySelector("[data-dashboard-loader-percent]");
  const fillEl = root.querySelector("[data-dashboard-loader-fill]");
  const ringEl = root.querySelector("[data-dashboard-loader-ring]");
  const activityEl = root.querySelector("[data-dashboard-loader-activity]");
  const titleEl = root.querySelector("[data-dashboard-loader-title]");
  const bodyEl = root.querySelector("[data-dashboard-loader-body]");
  const panelEl = root.querySelector("[data-dashboard-loader-stages]");
  if (root.getAttribute("data-dashboard-loader-stage") !== stage.id) {
    root.setAttribute("data-dashboard-loader-stage", stage.id);
  }
  if (percentEl && percentEl.textContent !== String(percent)) percentEl.textContent = String(percent);
  if (fillEl && fillEl.style.width !== percent + "%") fillEl.style.width = percent + "%";
  if (ringEl) {
    const ringProgress = (percent * 3.6) + "deg";
    if (ringEl.style.getPropertyValue("--dashboard-loader-progress") !== ringProgress) {
      ringEl.style.setProperty("--dashboard-loader-progress", ringProgress);
    }
  }
  const stageBody = dashboardPreloaderStageBody(stage);
  const activityText = dashboardPreloaderActivityText(_dashboardPreloaderState.activity, stageBody);
  const stageLabel = dashboardPreloaderStageLabel(stage);
  if (activityEl && activityEl.textContent !== activityText) activityEl.textContent = activityText;
  if (titleEl && titleEl.textContent !== stageLabel) titleEl.textContent = stageLabel;
  if (bodyEl && bodyEl.textContent !== stageBody) bodyEl.textContent = stageBody;
  if (!panelEl) return true;
  const activeIndex = dashboardPreloaderStageIndex(stage.id);
  if (panelEl.children.length !== DASHBOARD_PRELOADER_STAGES.length) {
    panelEl.innerHTML = DASHBOARD_PRELOADER_STAGES.map((item) => {
      return '<div class="dashboard-loader-step">' +
        '<span class="dashboard-loader-step-dot" aria-hidden="true"></span>' +
        '<span class="dashboard-loader-step-label"></span>' +
        '<span class="dashboard-loader-step-percent"></span>' +
        '</div>';
    }).join("");
  }
  DASHBOARD_PRELOADER_STAGES.forEach((item, index) => {
    const stepPercent = dashboardStagePercent(item, index, activeIndex, percent);
    const cls = index < activeIndex || _dashboardPreloaderState.complete
      ? "is-done"
      : (index === activeIndex ? "is-active" : "");
    const stepEl = panelEl.children[index];
    if (!stepEl) return;
    const className = "dashboard-loader-step" + (cls ? " " + cls : "");
    if (stepEl.className !== className) stepEl.className = className;
    const labelEl = stepEl.querySelector(".dashboard-loader-step-label");
    const stepPercentEl = stepEl.querySelector(".dashboard-loader-step-percent");
    const label = dashboardPreloaderStageLabel(item);
    const percentText = stepPercent + "%";
    if (labelEl && labelEl.textContent !== label) labelEl.textContent = label;
    if (stepPercentEl && stepPercentEl.textContent !== percentText) stepPercentEl.textContent = percentText;
  });
  return true;
}

function clearDashboardSmoothCompletion() {
  _dashboardSmoothTimers.forEach((timer) => clearTimeout(timer));
  _dashboardSmoothTimers = [];
  if (_dashboardSmoothResolve) {
    const resolve = _dashboardSmoothResolve;
    _dashboardSmoothResolve = null;
    resolve();
  }
}

function resetDashboardPreloader(options) {
  const opts = options || {};
  taagerDebugLog("preloader", "dashboard-reset", opts);
  clearDashboardSmoothCompletion();
  _dashboardPreloaderState.percent = 6;
  _dashboardPreloaderState.target = 6;
  _dashboardPreloaderState.stageId = "engine";
  _dashboardPreloaderState.activity = opts.activity || "Starting dashboard...";
  _dashboardPreloaderState.complete = false;
  updateDashboardPreloaderDom();
  startDashboardPreloaderMotion();
}

function applyDashboardPreloaderComplete(options) {
  const opts = options || {};
  taagerDebugLog("preloader", "dashboard-complete-apply", opts);
  if (_dashboardPreloaderState.motionTimer) {
    clearInterval(_dashboardPreloaderState.motionTimer);
    _dashboardPreloaderState.motionTimer = null;
    taagerDebugLog("preloader", "motion:stop-complete", {
      percent: 100,
      target: 100
    });
  }
  _dashboardPreloaderState.stageId = "rendering";
  _dashboardPreloaderState.complete = true;
  _dashboardPreloaderState.target = 100;
  _dashboardPreloaderState.percent = 100;
  _dashboardPreloaderState.activity = opts.activity || (opts.error ? "Dashboard opened with the best available data." : "Dashboard ready.");
  updateDashboardPreloaderDom();
}

function smoothCompleteDashboardPreloader(options) {
  const opts = options || {};
  taagerDebugLog("preloader", "dashboard-smooth-complete:start", opts);
  clearDashboardSmoothCompletion();
  const checkpoints = [
    { stage: "snapshot", percent: 30, activity: "Reading saved dashboard snapshots" },
    { stage: "accounts", percent: 44, activity: "Matching dashboard account scope" },
    { stage: "metrics", percent: 66, activity: "Preparing dashboard metrics" },
    { stage: "modules", percent: 80, activity: "Building dashboard views" },
    { stage: "marketing", percent: 91, activity: "Checking connected marketing spend" },
    { stage: "rendering", percent: 97, activity: opts.activity || "Rendering final dashboard" }
  ].filter((checkpoint) => checkpoint.percent > _dashboardPreloaderState.percent);
  const stepMs = Number.isFinite(Number(opts.stepMs)) ? Math.max(40, Number(opts.stepMs)) : 85;
  const holdMs = Number.isFinite(Number(opts.holdMs)) ? Math.max(40, Number(opts.holdMs)) : 120;

  return new Promise((resolve) => {
    _dashboardSmoothResolve = resolve;
    function finish() {
      taagerDebugLog("preloader", "dashboard-smooth-complete:finish", opts);
      applyDashboardPreloaderComplete(opts);
      const timer = setTimeout(() => {
        if (_dashboardSmoothResolve === resolve) _dashboardSmoothResolve = null;
        resolve();
      }, holdMs);
      _dashboardSmoothTimers.push(timer);
    }
    function next(index) {
      if (index >= checkpoints.length) {
        finish();
        return;
      }
      const checkpoint = checkpoints[index];
      const timer = setTimeout(() => {
        taagerDebugLog("preloader", "dashboard-smooth-complete:checkpoint", checkpoint);
        const stage = dashboardPreloaderStage(checkpoint.stage);
        _dashboardPreloaderState.stageId = stage.id;
        _dashboardPreloaderState.complete = false;
        _dashboardPreloaderState.target = Math.max(_dashboardPreloaderState.target, checkpoint.percent);
        _dashboardPreloaderState.percent = Math.max(_dashboardPreloaderState.percent, checkpoint.percent);
        _dashboardPreloaderState.activity = checkpoint.activity;
        updateDashboardPreloaderDom();
        next(index + 1);
      }, stepMs);
      _dashboardSmoothTimers.push(timer);
    }
    next(0);
  });
}

function startDashboardPreloaderMotion() {
  if (!dashboardPreloaderRoot()) {
    if (_dashboardPreloaderState.motionTimer) {
      clearInterval(_dashboardPreloaderState.motionTimer);
      _dashboardPreloaderState.motionTimer = null;
    }
    return;
  }
  if (_dashboardPreloaderState.motionTimer) {
    taagerDebugLog("preloader", "motion:already-running", {
      stageId: _dashboardPreloaderState.stageId,
      percent: _dashboardPreloaderState.percent,
      target: _dashboardPreloaderState.target
    });
    return;
  }
  taagerDebugLog("preloader", "motion:start", {
    stageId: _dashboardPreloaderState.stageId,
    percent: _dashboardPreloaderState.percent,
    target: _dashboardPreloaderState.target
  });
  var lastMotionLogAt = 0;
  var lastMotionLogPercent = -1;
  _dashboardPreloaderState.motionTimer = setInterval(() => {
    if (!dashboardPreloaderRoot()) {
      clearInterval(_dashboardPreloaderState.motionTimer);
      _dashboardPreloaderState.motionTimer = null;
      taagerDebugLog("preloader", "motion:stop-no-dom", {});
      return;
    }
    if (!_dashboardPreloaderState.complete && _dashboardPreloaderState.target < 92) {
      _dashboardPreloaderState.target = Math.min(92, _dashboardPreloaderState.target + 0.22);
    }
    const delta = _dashboardPreloaderState.target - _dashboardPreloaderState.percent;
    if (Math.abs(delta) > 0.12) {
      _dashboardPreloaderState.percent += Math.max(0.18, Math.abs(delta) * 0.14) * Math.sign(delta);
    }
    updateDashboardPreloaderDom();
    var roundedPercent = Math.round(_dashboardPreloaderState.percent);
    if (Date.now() - lastMotionLogAt > 1400 || Math.abs(roundedPercent - lastMotionLogPercent) >= 10) {
      lastMotionLogAt = Date.now();
      lastMotionLogPercent = roundedPercent;
      taagerDebugLog("preloader", "motion:tick", {
        stageId: _dashboardPreloaderState.stageId,
        percent: _dashboardPreloaderState.percent,
        target: _dashboardPreloaderState.target,
        complete: _dashboardPreloaderState.complete
      });
    }
    if (_dashboardPreloaderState.complete) {
      clearInterval(_dashboardPreloaderState.motionTimer);
      _dashboardPreloaderState.motionTimer = null;
      taagerDebugLog("preloader", "motion:stop-complete", {
        percent: _dashboardPreloaderState.percent,
        target: _dashboardPreloaderState.target
      });
    }
  }, 280);
}

function setDashboardPreloaderStage(stageId, options) {
  const stage = dashboardPreloaderStage(stageId);
  const opts = options || {};
  taagerDebugLog("preloader", "dashboard-stage", {
    requestedStageId: stageId,
    resolvedStageId: stage.id,
    options: opts,
    before: {
      stageId: _dashboardPreloaderState.stageId,
      percent: _dashboardPreloaderState.percent,
      target: _dashboardPreloaderState.target,
      complete: _dashboardPreloaderState.complete
    }
  });
  _dashboardPreloaderState.stageId = stage.id;
  _dashboardPreloaderState.complete = false;
  _dashboardPreloaderState.target = Math.max(_dashboardPreloaderState.target, Number(opts.percent || stage.target || 10));
  _dashboardPreloaderState.activity = opts.activity || _dashboardPreloaderState.activity || stage.body;
  updateDashboardPreloaderDom();
  startDashboardPreloaderMotion();
}

function completeDashboardPreloader(options) {
  const opts = options || {};
  taagerDebugLog("preloader", "dashboard-complete", opts);
  if (opts.smooth) return smoothCompleteDashboardPreloader(opts);
  clearDashboardSmoothCompletion();
  applyDashboardPreloaderComplete(opts);
  return Promise.resolve();
}

window.TaagerPreloader = {
  dashboardStage: setDashboardPreloaderStage,
  dashboardActivity: function (activity, percent) {
    taagerDebugLog("preloader", "dashboard-activity", { activity, percent });
    if (activity) _dashboardPreloaderState.activity = String(activity);
    if (percent != null) _dashboardPreloaderState.target = Math.max(_dashboardPreloaderState.target, Number(percent) || _dashboardPreloaderState.target);
    updateDashboardPreloaderDom();
    startDashboardPreloaderMotion();
  },
  dashboardRefresh: function (options) {
    taagerDebugLog("preloader", "dashboard-refresh", options || {});
    if (options && options.smooth) resetDashboardPreloader(options);
    else updateDashboardPreloaderDom();
  },
  dashboardComplete: completeDashboardPreloader
};
function dismissPreloaderWhenReady(pageId) {
  taagerDebugLog("preloader", "dismissWhenReady:check", { pageId, dismissed: _preloaderDismissed });
  if (_preloaderDismissed) return;

  if (pageId === "page-dashboard") {
    const dashboardReady = window._dashboardInitialReady;
    if (dashboardReady && typeof dashboardReady.then === "function") {
      taagerDebugLog("preloader", "dismissWhenReady:waiting-dashboard-ready");
      const watchdog = setTimeout(() => {
        if (!_preloaderDismissed) {
          taagerDebugLog("preloader", "dismissWhenReady:dashboard-ready-watchdog", {
            dashboardPreloaderState: Object.assign({}, _dashboardPreloaderState),
            hasInitialReady: !!window._dashboardInitialReady
          }, "warn");
        }
      }, 7000);
      dashboardReady.then((value) => {
        clearTimeout(watchdog);
        taagerDebugLog("preloader", "dismissWhenReady:dashboard-ready-resolved", {
          loaded: !!(value && value._loaded),
          loading: !!(value && value._loading),
          version: value && value._version,
          hasData: !!(value && value.meta && value.meta.hasData)
        });
        dismissPreloader();
      }).catch((err) => {
        clearTimeout(watchdog);
        taagerDebugLog("preloader", "dismissWhenReady:dashboard-ready-rejected", {
          error: err && err.message ? err.message : String(err || "")
        }, "error");
        dismissPreloader();
      });
      return;
    }
    if (!pageLifecycle("page-dashboard").mounted) {
      taagerDebugLog("preloader", "dismissWhenReady:dashboard-not-mounted-yet");
      return;
    }
    taagerDebugLog("preloader", "dismissWhenReady:dashboard-mounted-no-promise");
    dismissPreloader();
    return;
  }

  if (["page-analytics", "page-operations", "page-run-results", "page-notifications", "page-ai-intelligence"].includes(pageId) && !pageLifecycle(pageId).mounted) {
    taagerDebugLog("preloader", "dismissWhenReady:feature-not-mounted-yet", { pageId });
    return;
  }

  if (pageId === "page-setup") {
    const setupReady = window._setupInitialReady;
    if (setupReady && typeof setupReady.then === "function") {
      taagerDebugLog("preloader", "dismissWhenReady:waiting-setup-ready");
      setupReady.then(() => {
        taagerDebugLog("preloader", "dismissWhenReady:setup-ready-resolved");
        dismissPreloader();
      }).catch((err) => {
        taagerDebugLog("preloader", "dismissWhenReady:setup-ready-rejected", {
          error: err && err.message ? err.message : String(err || "")
        }, "error");
        dismissPreloader();
      });
    }
    return;
  }

  taagerDebugLog("preloader", "dismissWhenReady:generic-dismiss", { pageId });
  dismissPreloader();
}

let _activePageId = null;
function showPage(id) {
  taagerDebugLog("route", "showPage:start", {
    id,
    activeBefore: Array.from(document.querySelectorAll(".page.active")).map((page) => page.id)
  });
  perfMark("route:" + id + ":visible");
  TaagerPerf.measure("route:" + id + ":click-to-visible", "route:" + id + ":click", "route:" + id + ":visible", { pageId: id });
  const activePreview = document.querySelector(".premium-preview-overlay");
  if (activePreview) activePreview.remove();

  document.querySelectorAll(".page.active").forEach((activePage) => {
    if (activePage.id !== id) {
      deactivatePage(activePage.id);
      activePage.classList.remove("active");
    }
  });
  _activePageId = id;
  if (window.TaagerMonitoring) window.TaagerMonitoring.setRoute(id);
  const page = document.getElementById(id);
  page.classList.add("active");
  activatePage(id);
  const centerEl = document.getElementById("top-bar-center");
  if (centerEl) centerEl.classList.toggle("visible", PAGES_WITH_TOPBAR.has(id));
  if (window.TaagerUI) window.TaagerUI.enhance(page);
  if (id === "page-dashboard" && window._dashboardInitialReady) {
    setDashboardPreloaderStage("engine", {
      activity: "Dashboard startup in progress",
      body: window._t ? window._t("dashboard.initial_sync_body") : "Preparing saved orders, account metrics, product calculators, marketing spend, and AI context. Large workspaces can take a little while."
    });
  }
  // Dismiss preloader once the first page is ready.
  dismissPreloaderWhenReady(id);
  taagerDebugLog("route", "showPage:end", {
    id,
    lifecycle: window.TaagerPageLifecycle && window.TaagerPageLifecycle.snapshot ? window.TaagerPageLifecycle.snapshot()[id] : null
  });
}

// ── Periodic license & credentials sync every 60 seconds ──
let licenseCheckInterval = null;
let licenseCheckInFlight = false;
let licenseCheckTick = 0;
function startPeriodicLicenseCheck() {
  if (licenseCheckInterval) clearInterval(licenseCheckInterval);
  licenseCheckInterval = setInterval(async () => {
    if (window.isExpiredOverlayVisible && window.isExpiredOverlayVisible()) return;
    // Skip sync if the bot is currently running to prevent UI updates mid-run
    if (window._botIsRunning) return;
    if (licenseCheckInFlight) {
      taagerDebugLog("periodic-sync", "tick:skip-overlap", { tick: licenseCheckTick });
      return;
    }

    licenseCheckInFlight = true;
    const tick = ++licenseCheckTick;
    const tickStartedAt = Date.now();
    let topbarUpdated = false;
    let pageRerendered = false;
    taagerDebugLog("periodic-sync", "tick:start", { tick });

    try {
      // Use checkLicenseNocache to bypass cache and query fresh database state
      const lr = await window.api.checkLicenseNocache();
      if (!lr || !lr.valid) {
        clearInterval(licenseCheckInterval);
        if (shouldReturnToLicensePage(lr)) {
          returnToLicensePage();
          return;
        }
        _triggerExpiredOverlay(lr?.reason || "");
        return;
      }

      if (lr.forceFlush) {
        // Handled by force-flush event listener
        return;
      }

      // Sync user metadata, but do not touch the DOM when the values are
      // identical. Reassigning the same top-bar text causes a visible paint on
      // some Windows/Electron renderers even though no data changed.
      const previousUser = window._kbotUser || {};
      const nextCustomerName = lr.customerName || previousUser.customerName || null;
      const nextDaysLeft = lr.daysLeft;
      const nextLicenseKey = lr.key || previousUser.licenseKey || "";
      const userMetadataChanged =
        previousUser.customerName !== nextCustomerName ||
        previousUser.daysLeft !== nextDaysLeft ||
        previousUser.licenseKey !== nextLicenseKey;
      window._kbotUser = {
        ...previousUser,
        customerName: nextCustomerName,
        daysLeft:     nextDaysLeft,
        licenseKey:   nextLicenseKey,
      };
      if (userMetadataChanged) {
        updateTopBarText();
        topbarUpdated = true;
      }
      handleAdminNotification(lr.adminNotification);

      // Fetch fresh accounts & features state
      const creds = await window.api.getCredentials();
      
      const maxAccountsChanged = window._maxAccounts !== (creds.maxAccounts || 1);
      const accountsCountChanged = (window._kbotAccounts || []).length !== (creds.accounts || []).length;
      
      let locksChanged = false;
      if (!accountsCountChanged) {
        const oldLocks = (window._kbotAccounts || []).map(a => !!a.locked);
        const newLocks = (creds.accounts || []).map(a => !!a.locked);
        locksChanged = oldLocks.some((l, idx) => l !== newLocks[idx]);
      }

      const featureFlagsChanged = 
        window._analyticsEnabled !== (creds.analyticsEnabled !== false) ||
        window._operationsEnabled !== (creds.operationsEnabled !== false) ||
        window._dashboardEnabled !== (creds.dashboardEnabled === true) ||
        window._teamLeaderEnabled !== (creds.teamLeaderEnabled === true);

      taagerDebugLog("periodic-sync", "tick:diff", {
        tick,
        userMetadataChanged,
        maxAccountsChanged,
        accountsCountChanged,
        locksChanged,
        featureFlagsChanged
      });

      if (maxAccountsChanged || accountsCountChanged || locksChanged || featureFlagsChanged) {
        window._maxAccounts = creds.maxAccounts || 1;
        window._kbotAccounts = creds.accounts || [];

        window._analyticsEnabled  = creds.analyticsEnabled  !== false;
        window._operationsEnabled = creds.operationsEnabled !== false;
        window._dashboardEnabled  = creds.dashboardEnabled  === true;
        window._teamLeaderEnabled = creds.teamLeaderEnabled === true;

        if (window.invalidateDashboardCache) window.invalidateDashboardCache("periodic-sync");
        invalidatePage("page-dashboard", "periodic-sync");
        invalidatePage("page-analytics", "periodic-sync");
        invalidatePage("page-operations", "periodic-sync");
        invalidatePage("page-run-results", "periodic-sync");

        updateTopBarText();
        topbarUpdated = true;
        const activeId = document.querySelector(".page.active")?.id;
        if (window._teamLeaderEnabled && ["page-run", "page-results", "page-run-results", "page-analytics", "page-operations"].includes(activeId)) {
          goToDashboard();
        } else {
          reRenderCurrentPage();
        }
        pageRerendered = true;
      }
    } catch (err) {
      console.warn("[PeriodicSync] Background sync failed:", err?.message || err);
      taagerDebugLog("periodic-sync", "tick:error", {
        tick,
        error: err?.message || String(err || "")
      }, "warn");
    } finally {
      licenseCheckInFlight = false;
      taagerDebugLog("periodic-sync", "tick:complete", {
        tick,
        elapsedMs: Date.now() - tickStartedAt,
        topbarUpdated,
        pageRerendered
      });
    }
  }, 60 * 1000); // 60 seconds (1 minute)
}

function _triggerExpiredOverlay(reason) {
  try { Promise.resolve(window.api.killBot()).catch(() => {}); } catch (_) {}
  if (window.hideLicenseExpiryWarning) window.hideLicenseExpiryWarning();
  const licKey = (window._kbotUser || {}).licenseKey || '';
  window.showExpiredOverlay({
    licenseKey: licKey,
    customerName: (window._kbotUser || {}).customerName || '',
    reason:     reason || '',
    onResume: (freshResult) => {
      if (freshResult) {
        window._kbotUser = {
          ...(window._kbotUser || {}),
          daysLeft:     freshResult.daysLeft ?? null,
          customerName: freshResult.customerName || (window._kbotUser || {}).customerName,
          licenseKey:   freshResult.key || (window._kbotUser || {}).licenseKey || '',
        };
        window._kbotAllowReset = freshResult.allowReset === true;
        updateTopBarText();
      }
      handleAdminNotification(freshResult && freshResult.adminNotification);
      startPeriodicLicenseCheck();
    },
  });
}

function shouldReturnToLicensePage(result) {
  const reason = String((result && result.reason) || "").toLowerCase();
  const hasKnownKey = !!(((window._kbotUser || {}).licenseKey) || (result && result.key));
  return !result || (!result.valid && (
    !hasKnownKey ||
    reason.includes("not found") ||
    reason.includes("no license key")
  ));
}

function rememberInvalidLicenseContext(result) {
  result = result || {};
  window._kbotUser = {
    ...(window._kbotUser || {}),
    customerName: result.customerName || (window._kbotUser || {}).customerName || null,
    daysLeft: null,
    licenseKey: result.key || (window._kbotUser || {}).licenseKey || "",
  };
  updateTopBarText();
}

function returnToLicensePage() {
  clearInterval(licenseCheckInterval);
  try { Promise.resolve(window.api.killBot()).catch(() => {}); } catch (_) {}
  if (window.hideExpiredOverlay) window.hideExpiredOverlay();
  window._kbotUser = {
    ...(window._kbotUser || {}),
    daysLeft: null,
    licenseKey: "",
  };
  updateTopBarText();
  const btn = document.getElementById("btn-admin-refresh");
  if (btn) btn.style.display = "none";
  const clearCacheBtn = document.getElementById("btn-clear-cache");
  if (clearCacheBtn) clearCacheBtn.style.display = "none";
  renderLicense(() => afterLicense());
  showPage("page-license");
}
window.returnToLicensePage = returnToLicensePage;

function resolveAutoRunAccountIds(creds) {
  const accounts = (creds && creds.accounts) || [];
  const runnableAccounts = accounts.filter(a => a && a.accountType !== "static");
  const allIds = runnableAccounts.map(a => a.id);
  const savedIds = Array.isArray(creds && creds.autoRunAccountIds) ? creds.autoRunAccountIds : [];
  const selected = savedIds.filter(id => allIds.includes(id));
  return selected.length ? selected : allIds;
}

async function runAutoRunTick(dateFrom, dateTo) {
  if (window._autoRunTickInProgress) return;
  const active = document.querySelector(".page.active");
  if (active && active.id === "page-run") return;

  window._autoRunTickInProgress = true;
  let freshCreds = null;
  try {
    freshCreds = await window.api.getCredentials();
    window._kbotAccounts = freshCreds.accounts || [];
  } catch (_) {}

  try {
    const accountIds = resolveAutoRunAccountIds(freshCreds || { accounts: window._kbotAccounts || [] });
    if (!accountIds.length) {
      console.warn("[auto-run] No runnable accounts found, skipping tick.");
      return;
    }
    goToRun(dateFrom, dateTo, accountIds);
  } finally {
    setTimeout(() => { window._autoRunTickInProgress = false; }, 5000);
  }
}
// ── Admin Sync: re-fetch license + account state from Supabase without restarting ──
// Called by the ↻ Sync button in the topbar.
// What it refreshes:
//   1. License validity, expiry, max_accounts (busts the 60-second cache)
//   2. Per-account unlock status from license_accounts table (busts 15-second cred cache)
//   3. Refreshes the current page in place without recreating the startup preloader
// Retained for internal/manual use; the titlebar button uses a full reload.
async function adminRefresh() {
  const btn = document.getElementById("btn-admin-refresh");
  if (!btn || btn.classList.contains("refreshing")) return;

  btn.classList.add("refreshing");
  taagerDebugLog("admin-sync", "start", {
    activePage: document.querySelector(".page.active")?.id || null
  });

  try {
    // 1. Re-check license (nocache = busts the 60-second in-memory cache)
    const lr = await window.api.checkLicenseNocache();

    if (!lr || !lr.valid) {
      if (shouldReturnToLicensePage(lr)) {
        returnToLicensePage();
        return;
      }
      // License is now invalid (revoked/expired) — show expired overlay
      btn.classList.remove("refreshing");
      _triggerExpiredOverlay(lr?.reason || "");
      return;
    }

    if (lr.forceFlush) {
      btn.classList.remove("refreshing");
      return;
    }

    // 2. Update global user state with fresh values from server
    window._kbotUser = {
      ...(window._kbotUser || {}),
      customerName: lr.customerName || (window._kbotUser || {}).customerName || null,
      daysLeft:     lr.daysLeft,
      licenseKey:   lr.key || (window._kbotUser || {}).licenseKey || "",
    };

    // 3. Re-fetch credentials — checkLicenseNocache also busts the main-process
    //    credential cache, so account unlocks and slot changes are fresh here.
    const creds = await window.api.getCredentials();
    window._maxAccounts       = creds.maxAccounts || 1;
    window._kbotAccounts      = creds.accounts || [];
    window._analyticsEnabled  = creds.analyticsEnabled  !== false;
    window._operationsEnabled = creds.operationsEnabled !== false;
    window._dashboardEnabled  = creds.dashboardEnabled  === true;
    window._teamLeaderEnabled = creds.teamLeaderEnabled === true;
    if (window.invalidateDashboardCache) window.invalidateDashboardCache("admin-refresh");
    invalidatePage("page-dashboard", "admin-refresh");
    invalidatePage("page-analytics", "admin-refresh");
    invalidatePage("page-operations", "admin-refresh");
    invalidatePage("page-run-results", "admin-refresh");

    // 4. Refresh topbar text (expiry days, accounts badge)
    updateTopBarText();

    // 5. Refresh the active route once, in place. A full renderer reload recreates
    //    index.html and its startup preloader, making one Sync click look like
    //    several separate refreshes.
    const activePage = document.querySelector(".page.active");
    const activePageId = activePage && activePage.id;
    taagerDebugLog("admin-sync", "refresh-route", { activePageId });
    if (activePageId === "page-dashboard" ||
        (window._teamLeaderEnabled && ["page-run", "page-results", "page-run-results", "page-analytics", "page-operations"].includes(activePageId))) {
      await goToDashboard();
    } else {
      await reRenderCurrentPage();
    }
  } catch (err) {
    console.warn("[AdminRefresh] Sync failed:", err?.message || err);
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "adminRefresh" });
  } finally {
    btn.classList.remove("refreshing");
    taagerDebugLog("admin-sync", "complete", {
      activePage: document.querySelector(".page.active")?.id || null
    });
  }
}

function clearAdminRepairBrowserStorage() {
  try { localStorage.clear(); } catch (err) { console.warn("[AdminCacheReset] localStorage clear failed:", err); }
  try { sessionStorage.clear(); } catch (err) { console.warn("[AdminCacheReset] sessionStorage clear failed:", err); }
}

async function handleLocalClearCache() {
  const btn = document.getElementById("btn-clear-cache");
  if (!btn || btn.classList.contains("clearing")) return;
  const message = window._t ? window._t("titlebar.clear_cache_confirm") : "This clears local cache and reloads the app. It will not delete accounts, license, or orders. Continue?";
  if (!window.confirm(message)) return;
  btn.classList.add("clearing");
  const label = btn.querySelector(".clear-cache-label");
  if (label) label.textContent = window._t ? window._t("titlebar.clearing_cache") : "Clearing...";
  try {
    if (window.api && typeof window.api.repairLocalCache === "function") await window.api.repairLocalCache();
  } catch (err) {
    console.warn("[LocalClearCache] Failed:", err?.message || err);
    btn.classList.remove("clearing");
    if (label) label.textContent = window._t ? window._t("titlebar.clear_cache") : "Clear Cache";
  }
}

function handleAdminCacheReset() {
  clearAdminRepairBrowserStorage();
  if (window.invalidateDashboardCache) window.invalidateDashboardCache("admin-cache-reset");
  if (window.invalidateDashboardAiContextCache) window.invalidateDashboardAiContextCache();
  invalidatePage("page-dashboard", "admin-cache-reset");
  invalidatePage("page-analytics", "admin-cache-reset");
  invalidatePage("page-operations", "admin-cache-reset");
  invalidatePage("page-run-results", "admin-cache-reset");
  reloadAppPreservingRoute("admin-cache-reset");
}

async function init() {
  const reloadRestoreState = consumeAppReloadRestoreState();
  document.getElementById("btn-minimize").addEventListener("click", () => window.api.minimize());
  document.getElementById("btn-maximize").addEventListener("click", () => window.api.maximize());
  document.getElementById("btn-close").addEventListener("click",    () => window.api.close());
  document.getElementById("btn-zoom-out").addEventListener("click", () => window.api.decreaseAppZoom());
  document.getElementById("btn-zoom-reset").addEventListener("click", () => window.api.resetAppZoom());
  document.getElementById("btn-zoom-in").addEventListener("click", () => window.api.increaseAppZoom());
  if (window.api.onAppZoomChanged) window.api.onAppZoomChanged(updateAppZoomDisplay);
  installAppZoomShortcuts();

  // The Sync button now performs the same full renderer refresh as Ctrl+R.
  const _refreshBtn = document.getElementById("btn-admin-refresh");
  if (_refreshBtn) {
    _refreshBtn.addEventListener("click", () => reloadAppPreservingRoute("admin-refresh"));
  }
  const _clearCacheBtn = document.getElementById("btn-clear-cache");
  if (_clearCacheBtn) {
    _clearCacheBtn.addEventListener("click", handleLocalClearCache);
  }
  window.api.removeAllListeners("reset-cache");
  window.api.on("reset-cache", handleAdminCacheReset);

  // Load saved settings then apply — do both in parallel where possible
  let startupState = null;
  let settings = null;
  let licenseResult = null;
  let creds = null;

  try {
    startupState = window.api.getStartupState ? await window.api.getStartupState() : null;
    settings = startupState && startupState.settings ? startupState.settings : await window.api.getSettings();
    licenseResult = startupState && startupState.license ? startupState.license : null;
    creds = startupState && startupState.credentials ? startupState.credentials : null;
    applyTheme(settings.theme || "dark");
    applyLang(settings.lang  || "ar");
    updateAppZoomDisplay(settings.appZoom || 100);
  } catch(e) {
    applyTheme("dark");
    applyLang("ar");
    updateAppZoomDisplay(100);
  }

  document.getElementById("toggle-theme").addEventListener("change", (e) => {
    const next = e.target.checked ? "light" : "dark";
    applyTheme(next);
    window.api.saveSettings({ theme: next }).catch(() => {});
  });
  document.getElementById("toggle-lang").addEventListener("change", (e) => {
    const next = e.target.checked ? "ar" : "en";
    applyLang(next, { deferWork: true });
    // Persist in background — don't await so UI is never blocked
    window.api.saveSettings({ lang: next }).catch(() => {});
  });

  if (!licenseResult || !creds) {
    [licenseResult, creds] = await Promise.all([
      window.api.checkLicense(),
      window.api.getCredentials(),
    ]);
  }

  if (!licenseResult.valid) {
    if (!shouldReturnToLicensePage(licenseResult)) {
      rememberInvalidLicenseContext(licenseResult);
      renderLicense(() => afterLicense());
      showPage("page-license");
      _triggerExpiredOverlay(licenseResult.reason || "");
      return;
    }
    renderLicense(() => afterLicense());
    showPage("page-license");
    return;
  }

  window._kbotUser = {
    customerName: licenseResult.customerName || null,
    daysLeft:     licenseResult.daysLeft,
    licenseKey:   licenseResult.key || '',
  };
  if (window.monitoring) {
    window.monitoring.setUserContext({ customerName: window._kbotUser.customerName });
  }
  window._kbotAllowReset = licenseResult.allowReset === true;
  updateTopBarText();
  handleAdminNotification(licenseResult.adminNotification);

  // Show admin sync button now that license is confirmed valid
  const _rb = document.getElementById("btn-admin-refresh");
  if (_rb) _rb.style.display = "inline-flex";
  const _ccb = document.getElementById("btn-clear-cache");
  if (_ccb) _ccb.style.display = "inline-flex";

  window.api.removeAllListeners("license-expired");
  window.api.onLicenseExpired(() => {
    clearInterval(licenseCheckInterval);
    _triggerExpiredOverlay();
  });
  window.api.removeAllListeners("force-flush");
  window.api.on("force-flush", () => {
    clearInterval(licenseCheckInterval);
    try { Promise.resolve(window.api.killBot()).catch(() => {}); } catch (_) {}
    if (window.hideExpiredOverlay) window.hideExpiredOverlay();
    afterLicense(true);
  });
  window.api.removeAllListeners("auto-run-tick");
  window.api.onAutoRunTick(async ({ dateFrom, dateTo }) => {
    await runAutoRunTick(dateFrom, dateTo);
  });

  startPeriodicLicenseCheck();

  // creds already fetched above via Promise.all — reuse it
  window._maxAccounts       = creds.maxAccounts || 1;
  window._kbotAccounts      = creds.accounts || [];
  window._analyticsEnabled  = creds.analyticsEnabled  !== false;
  window._operationsEnabled = creds.operationsEnabled !== false;
  window._dashboardEnabled  = creds.dashboardEnabled  === true;
  window._teamLeaderEnabled = creds.teamLeaderEnabled === true;
  updateTopBarText();
  primeLikelyFeatureRoutes(window._teamLeaderEnabled ? "dashboard" : null);
  // Route based on credential state:
  // - Accounts exist → skip the accounts management step, go straight to run step
  // - No accounts    → land on accounts step so user can add their first account
  routeAfterCredentialsReady(creds, reloadRestoreState);
  scheduleFeaturePrewarm(window._teamLeaderEnabled ? "dashboard" : null);

  setTimeout(refreshStartupStateFromServer, 250);
}

async function refreshStartupStateFromServer() {
  if (window._botIsRunning) return;
  try {
    const [freshLicense, freshCreds] = await Promise.all([
      window.api.checkLicenseNocache(),
      window.api.getCredentials(),
    ]);
    if (!freshLicense || !freshLicense.valid) {
      clearInterval(licenseCheckInterval);
      if (shouldReturnToLicensePage(freshLicense)) {
        returnToLicensePage();
        return;
      }
      rememberInvalidLicenseContext(freshLicense);
      _triggerExpiredOverlay(freshLicense.reason || "");
      return;
    }
    window._kbotUser = {
      customerName: freshLicense.customerName || null,
      daysLeft:     freshLicense.daysLeft,
      licenseKey:   freshLicense.key || '',
    };
    window._kbotAllowReset = freshLicense.allowReset === true;
    window._maxAccounts       = freshCreds.maxAccounts || 1;
    window._kbotAccounts      = freshCreds.accounts || [];
    window._analyticsEnabled  = freshCreds.analyticsEnabled  !== false;
    window._operationsEnabled = freshCreds.operationsEnabled !== false;
    window._dashboardEnabled  = freshCreds.dashboardEnabled  === true;
    window._teamLeaderEnabled = freshCreds.teamLeaderEnabled === true;
    updateTopBarText();
    handleAdminNotification(freshLicense.adminNotification);
    if (_activePageId === "page-setup" && typeof window.renderSetup === "function") {
      const hasAccounts = freshCreds.accounts && freshCreds.accounts.length > 0;
      const hasRunnableAccounts = hasAccounts && freshCreds.accounts.some(account => account && account.accountType !== "static");
      goToSetup(hasRunnableAccounts ? "run" : "accounts");
    }
  } catch (e) {
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(e, { operation: "startup.backgroundRefresh" });
  }
}

async function afterLicense(isFlush = false) {
  window.api.removeAllListeners("license-expired");
  window.api.onLicenseExpired(() => {
    clearInterval(licenseCheckInterval);
    _triggerExpiredOverlay();
  });
  window.api.removeAllListeners("force-flush");
  window.api.on("force-flush", () => {
    clearInterval(licenseCheckInterval);
    try { Promise.resolve(window.api.killBot()).catch(() => {}); } catch (_) {}
    if (window.hideExpiredOverlay) window.hideExpiredOverlay();
    afterLicense(true);
  });
  window.api.removeAllListeners("auto-run-tick");
  window.api.onAutoRunTick(async ({ dateFrom, dateTo }) => {
    await runAutoRunTick(dateFrom, dateTo);
  });

  startPeriodicLicenseCheck();

  if (!isFlush) {
    try {
      const lr = await window.api.checkLicense();
      if (lr.valid) {
        window._kbotUser = { customerName: lr.customerName || null, daysLeft: lr.daysLeft, licenseKey: lr.key || '' };
        window._kbotAllowReset = lr.allowReset === true;
        updateTopBarText();
        handleAdminNotification(lr.adminNotification);
        // Show admin sync button now that license is confirmed valid
        const _rb = document.getElementById("btn-admin-refresh");
        if (_rb) _rb.style.display = "inline-flex";
        const _ccb = document.getElementById("btn-clear-cache");
        if (_ccb) _ccb.style.display = "inline-flex";
      }
    } catch(e) {}
  }

  const creds = await window.api.getCredentials();
  window._maxAccounts       = creds.maxAccounts || 1;
  window._kbotAccounts      = creds.accounts || [];
  window._analyticsEnabled  = creds.analyticsEnabled  !== false;
  window._operationsEnabled = creds.operationsEnabled !== false;
  window._dashboardEnabled  = creds.dashboardEnabled  === true;
  window._teamLeaderEnabled = creds.teamLeaderEnabled === true;
  primeLikelyFeatureRoutes(window._teamLeaderEnabled ? "dashboard" : null);
  routeAfterCredentialsReady(creds, null);
  scheduleFeaturePrewarm(window._teamLeaderEnabled ? "dashboard" : null);
}

function goToSetup(initialStep) {
  if (window._botIsRunning) {
    showPage("page-run");
    return;
  }
  renderSetup((params) => {
    if (params && params.dateFrom) {
      sessionDate = { dateFrom: params.dateFrom, dateTo: params.dateTo };
      goToRun(params.dateFrom, params.dateTo, params.selectedAccountIds);
    } else {
      goToSetup("accounts");
    }
  }, initialStep || "accounts");
  showPage("page-setup");
}

function goToRun(dateFrom, dateTo, selectedAccountIds) {
  if (window._teamLeaderEnabled || !(window._kbotAccounts || []).some(account => account && account.accountType !== "static")) {
    if (window._dashboardEnabled && typeof _onRunForDashboard === "function") {
      _onRunForDashboard(selectedAccountIds || [], { dateFrom, dateTo }, { stayOnDashboard: true }).catch((err) => {
        if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "dashboard.autorunFetch" });
        console.warn("[Dashboard] Auto-run update failed:", err?.message || err);
        goToDashboard();
      });
    } else {
      goToDashboard();
    }
    return;
  }
  renderRun(dateFrom, dateTo, selectedAccountIds || [], (resultData) => {
    goToResults(resultData, dateFrom, dateTo, selectedAccountIds);
  }, () => {
    goToSetup("run");
  });
  showPage("page-run");
}

// ── Analytics: save hook ─────────────────────────────────────────────────────
async function _saveAnalyticsFromResult(data, selectedAccountIds, runTimestamp) {
  const now     = Number(runTimestamp) || Date.now();
  const runDate = new Date(now).toISOString().slice(0, 10);
  const accounts = Array.isArray(window._kbotAccounts) ? window._kbotAccounts : [];

  function confirmedAnalyticsRows(resultData) {
    if (Array.isArray(resultData?.confirmedOrderRows)) return resultData.confirmedOrderRows;
    if (Array.isArray(resultData?.orderRows)) return resultData.orderRows;
    return [];
  }

  function attemptedAnalyticsRows(resultData) {
    if (Array.isArray(resultData?.attemptedOrderRows)) return resultData.attemptedOrderRows;
    if (Array.isArray(resultData?.orderRows)) return resultData.orderRows;
    return [];
  }
  function resolveAccountIdentity(result, fallbackId) {
    const accountId = result?.accountId || fallbackId || "__single__";
    const account = accounts.find(a => a.id === accountId) || null;
    const label = result?.accountLabel || result?._accountLabel || result?.accountEmail || "";
    const email = account?.lightfunnelsEmail || account?.easyEmail || result?.accountEmail || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(label) ? label : "");
    const friendlyLabel = account?.memberName || account?.lightfunnelsAccountName || account?.label || account?.easyStore || account?.storeName || account?.name || label || email || "";
    return {
      accountId,
      accountEmail: email || label || "",
      accountLabel: friendlyLabel || "Account",
      taagerCountry: (result?.taagerCountry || result?.data?.taagerCountry || account?.taagerCountry || "sa").toLowerCase(),
    };
  }

  // Multi-account path
  if (data._multiAccount && Array.isArray(data._accountResults)) {
    for (const r of data._accountResults) {
      const identity = resolveAccountIdentity(r);
      const confirmedRows = confirmedAnalyticsRows(r.data);
      const attemptedRows = attemptedAnalyticsRows(r.data);
      const saveRes = await window.api.saveRunAnalytics({
        runId:           `${r.accountId || "acc"}-${now}`,
        runDate,
        runTimestamp:    now,
        accountId:       identity.accountId,
        accountEmail:    identity.accountEmail,
        accountLabel:    identity.accountLabel,
        taagerCountry:   identity.taagerCountry,
        ordersSubmitted: confirmedRows.length,
        ordersConfirmed: confirmedRows.length,
        ordersAttempted: attemptedRows.length || r.data?.orders || 0,
        ordersFailed:    r.data?.failedOrders?.count || 0,
        runtimeMs:       r.runtimeMs || r.data?.runtimeMs || 0,
        runStartedAt:    r.runStartedAt || r.data?.runStartedAt || null,
        runEndedAt:      r.runEndedAt || r.data?.runEndedAt || null,
        orders:          confirmedRows,
        analyticsOrdersSource: "taager-confirmed",
        buffer:          null,
        taagerSnapshot:    r.data?.taagerSnapshot || null,
        taagerDashboardSnapshot: r.data?.taagerDashboardSnapshot || null,
      });
      if (saveRes && saveRes.dashboardRowsSaved > 0 && window.invalidateDashboardCache) window.invalidateDashboardCache();
    }
    window.dispatchEvent(new CustomEvent("taager-analytics-runs-updated"));
    return;
  }

  // Single-account path
  const identity = resolveAccountIdentity(data, selectedAccountIds?.[0]);
  const confirmedRows = confirmedAnalyticsRows(data);
  const attemptedRows = attemptedAnalyticsRows(data);
  const saveRes = await window.api.saveRunAnalytics({
    runId:           `single-${now}`,
    runDate,
    runTimestamp:    now,
    accountId:       identity.accountId,
    accountEmail:    identity.accountEmail,
    accountLabel:    identity.accountLabel,
    taagerCountry:   identity.taagerCountry,
    ordersSubmitted: confirmedRows.length,
    ordersConfirmed: confirmedRows.length,
    ordersAttempted: attemptedRows.length || data.orders || 0,
    ordersFailed:    data.failedOrders?.count || 0,
    runtimeMs:       data.runtimeMs || 0,
    runStartedAt:    data.runStartedAt || null,
    runEndedAt:      data.runEndedAt || null,
    orders:          confirmedRows,
    analyticsOrdersSource: "taager-confirmed",
    buffer:          null,
    taagerSnapshot:    data.taagerSnapshot || null,
    taagerDashboardSnapshot: data.taagerDashboardSnapshot || null,
  });
  if (saveRes && saveRes.dashboardRowsSaved > 0 && window.invalidateDashboardCache) window.invalidateDashboardCache();
  window.dispatchEvent(new CustomEvent("taager-analytics-runs-updated"));
}

async function _saveRunResultsFromResult(data, dateFrom, dateTo, selectedAccountIds, runTimestamp) {
  if (!window.api || typeof window.api.saveRunResults !== "function") return;
  const now = Number(runTimestamp) || Date.now();
  const accounts = Array.isArray(window._kbotAccounts) ? window._kbotAccounts : [];

  function safeText(value) {
    return value == null ? "" : String(value);
  }

  function orderDestination(order) {
    return safeText(order && order.destination || "cart").trim() || "cart";
  }

  function isMissingDestination(order) {
    return orderDestination(order) === "missing-orders";
  }

  function confirmedRows(resultData) {
    const rows = Array.isArray(resultData?.confirmedOrderRows)
      ? resultData.confirmedOrderRows
      : (Array.isArray(resultData?.orderRows) ? resultData.orderRows : []);
    return rows.filter(row => !isMissingDestination(row));
  }

  function successfulRows(resultData) {
    return Array.isArray(resultData?.confirmedOrderRows)
      ? resultData.confirmedOrderRows
      : (Array.isArray(resultData?.orderRows) ? resultData.orderRows : []);
  }

  function attemptedRows(resultData) {
    if (Array.isArray(resultData?.attemptedOrderRows)) return resultData.attemptedOrderRows;
    if (Array.isArray(resultData?.orderRows)) return resultData.orderRows;
    return [];
  }

  function failedRows(resultData) {
    const failed = resultData?.failedOrders || {};
    if (Array.isArray(failed.errorRows) && failed.errorRows.length) return failed.errorRows;
    if (Array.isArray(failed.summary) && failed.summary.length) return failed.summary;
    return [];
  }

  function skippedRows(resultData) {
    return Array.isArray(resultData?.skippedOrders?.rows) ? resultData.skippedOrders.rows : [];
  }

  function recoveryManualRows(resultData) {
    const recovery = resultData?.affiliateRecovery;
    return recovery && recovery.enabled === true && Array.isArray(recovery.manualReviewRows)
      ? recovery.manualReviewRows
      : [];
  }

  function reasonFor(row, fallback) {
    return safeText(row.reasonMessage || row.actionMessage || row.error || row.errorMessage || row.reason || row.recoveryStatus || fallback);
  }

  function actionFor(outcome, row) {
    const reason = reasonFor(row, "").toLowerCase();
    if (outcome === "failed_on_taager") {
      if (/stock|out_of_stock|Ù…Ø®Ø²ÙˆÙ†/.test(reason)) return "Change SKU or check stock, then retry manually.";
      if (/phone|Ù‡Ø§ØªÙ/.test(reason)) return "Fix the phone number, then retry.";
      return "Open the failed order details and review it manually.";
    }
    if (outcome === "submitted_uncertain") return "Check Taager or Missing Orders before treating this as confirmed.";
    if (outcome === "skipped_warning") return "Review the warning and fix the row before retrying.";
    return "";
  }

  function normalizeOrder(row, outcome, index) {
    row = row || {};
    const product = row.productName || row.product || row.skuProduct || "";
    const phone = row.phone || row.normalizedPhone || row.normPhone || row.rawPhone || "";
    return {
      outcome,
      customerName: safeText(row.customerName || row.name || row.recipientName),
      phone: safeText(phone),
      sku: safeText(row.sku || row.productSku || row.taagerSku),
      productName: safeText(product),
      quantity: Number(row.qty || row.quantity || row.count) || 1,
      city: safeText(row.city || row.region || ""),
      source: safeText(row.source || row.recoverySource || "real"),
      destination: orderDestination(row),
      taagerOrderNumber: safeText(row.taagerOrderNumber || row.orderNumber || row.orderId),
      reasonCode: safeText(row.reason || row.recoveryStatus || row.errorCode),
      reasonMessage: reasonFor(row, ""),
      suggestedAction: actionFor(outcome, row),
      rowNumber: row.row || row.index || index + 1,
    };
  }

  function resolveAccountIdentity(result, fallbackId) {
    const accountId = result?.accountId || fallbackId || "__single__";
    const account = accounts.find(a => a.id === accountId) || null;
    const label = result?.accountLabel || result?._accountLabel || result?.accountEmail || "";
    const email = account?.lightfunnelsEmail || account?.easyEmail || result?.accountEmail || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(label) ? label : "");
    const friendlyLabel = account?.memberName || account?.lightfunnelsAccountName || account?.label || account?.easyStore || account?.storeName || account?.name || label || email || "";
    return {
      accountId,
      accountEmail: email || label || "",
      accountLabel: friendlyLabel || "Account",
      taagerCountry: (result?.taagerCountry || result?.data?.taagerCountry || account?.taagerCountry || "sa").toLowerCase(),
    };
  }

  async function saveOne(resultData, identity, runIdSuffix) {
    const attempts = attemptedRows(resultData);
    const confirmed = confirmedRows(resultData);
    const submittedUncertain = successfulRows(resultData).filter(isMissingDestination);
    const failed = failedRows(resultData);
    const skipped = skippedRows(resultData);
    const recoveryRows = recoveryManualRows(resultData);
    const uncertain = submittedUncertain.length + skipped.length + recoveryRows.length;
    const status = failed.length > 0 ? "failed" : (uncertain > 0 ? "needs_review" : "all_ok");
    const orders = [
      ...attempts.map((row, i) => normalizeOrder(row, "attempted", i)),
      ...confirmed.map((row, i) => normalizeOrder(row, "confirmed_in_taager", i)),
      ...submittedUncertain.map((row, i) => normalizeOrder(row, "submitted_uncertain", i)),
      ...recoveryRows.map((row, i) => normalizeOrder(row, "submitted_uncertain", i)),
      ...skipped.map((row, i) => normalizeOrder(row, "skipped_warning", i)),
      ...failed.map((row, i) => normalizeOrder(row, "failed_on_taager", i)),
    ];

    await window.api.saveRunResults({
      runId: `${identity.accountId || "account"}-${runIdSuffix}`,
      accountId: identity.accountId,
      accountLabel: identity.accountLabel,
      taagerCountry: identity.taagerCountry,
      dateFrom,
      dateTo,
      runTimestamp: now,
      status,
      summary: {
        attempted: attempts.length,
        confirmed: confirmed.length,
        uncertain,
        failed: failed.length,
      },
      account: {
        id: identity.accountId,
        label: identity.accountLabel,
        email: identity.accountEmail,
        country: identity.taagerCountry,
      },
      range: { from: dateFrom || "", to: dateTo || "" },
      orders,
      artifacts: {
        failedWorkbookPath: resultData?.failedOrders?.failedPath || "",
        failedFolderPath: resultData?.failedOrders?.failedDir || "",
        skippedWorkbookPath: resultData?.skippedOrders?.filePath || "",
      },
    });
  }

  if (data && data._multiAccount && Array.isArray(data._accountResults)) {
    await Promise.all(data._accountResults.map((result) => {
      const identity = resolveAccountIdentity(result);
      return saveOne(result.data || {}, identity, now);
    }));
  } else {
    await saveOne(data || {}, resolveAccountIdentity(data, selectedAccountIds?.[0]), now);
  }
  window.dispatchEvent(new CustomEvent("taager-run-results-updated"));
}

function goToResults(data, dateFrom, dateTo, selectedAccountIds) {
  const runTimestamp = Date.now();
  // Fire-and-forget: save run data for Analytics/Operations pages
  _saveAnalyticsFromResult(data, selectedAccountIds, runTimestamp).catch(e => {
    console.warn("[Analytics] save failed silently:", e);
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(e, { operation: "analytics.saveFromResult" });
  });
  _saveRunResultsFromResult(data, dateFrom, dateTo, selectedAccountIds, runTimestamp).catch(e => {
    console.warn("[RunResults] save failed silently:", e);
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(e, { operation: "runResults.saveFromResult" });
  });
  const onRunAgain = () => { goToRun(dateFrom, dateTo, selectedAccountIds); };
  const onHome     = () => { sessionDate = null; goToSetup("run"); };
  // Cache so language switch can re-render results without losing data
  window._lastResultArgs = { data, dateFrom, dateTo, onRunAgain, onHome };
  try {
    renderResults(data, dateFrom, dateTo, onRunAgain, onHome);
  } catch (err) {
    console.error("Results render failed", err);
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "results.render" });
    const el = document.getElementById("page-results");
    if (el) {
      el.innerHTML = `
        <div class="page-wrap"><div class="page-inner" style="display:flex;flex-direction:column;gap:14px">
          <div class="notice-box warn" style="border-color:var(--danger);background:rgba(255,77,109,0.1)">
            <span class="notice-icon">❌</span>
            <div class="notice-text">
              <strong>${window._t("results.run_failed")}</strong>
              <span>${err.message || err}</span>
            </div>
          </div>
          <button class="btn btn-primary" id="btn-results-back">${window._t("results.home")}</button>
        </div></div>`;
      document.getElementById("btn-results-back")?.addEventListener("click", () => {
        sessionDate = null;
        goToSetup("run");
      });
    }
  }
  showPage("page-results");
}

// ── Feature-locked page helper ─────────────────────────────────────────────
function _renderLockedPage(pageId, featureNameEn, featureNameAr) {
  const el = document.getElementById(pageId);
  if (!el) return;
  const isAr = (window._kbotLang || "en") === "ar";
  const name = isAr ? featureNameAr : featureNameEn;
  const title = isAr ? "هذه الميزة غير مفعّلة" : "Feature Not Enabled";
  const sub   = isAr
    ? `ميزة "${name}" غير مضمّنة في ترخيصك الحالي. تواصل مع الدعم للترقية.`
    : `"${name}" is not included in your current license. Contact support to upgrade.`;
  const supportLabel = isAr ? "تواصل مع الدعم" : "Contact Support";
  el.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      height:100%; min-height:400px; gap:16px; padding:40px;
      color:var(--text2); text-align:center;
    ">
      <div style="font-size:var(--type-hero-lg); opacity:.4">🔒</div>
      <div style="font-size:var(--type-section-title); font-weight:var(--weight-bold); color:var(--text)">${title}</div>
      <div style="font-size:var(--type-body); max-width:360px; line-height:1.6">${sub}</div>
      <button class="btn btn-primary" id="${pageId}-support-btn" type="button">${supportLabel}</button>
    </div>`;
  document.getElementById(`${pageId}-support-btn`)?.addEventListener("click", () => {
    if (window.TaagerSupport && typeof window.TaagerSupport.open === "function") window.TaagerSupport.open();
  });
}

async function goToAnalytics() {
  if (window._teamLeaderEnabled || !(window._kbotAccounts || []).some(account => account && account.accountType !== "static")) {
    goToDashboard();
    return;
  }
  const token = nextFeatureRouteToken("analytics");
  perfMark("route:page-analytics:click");
  if (canWarmActivate("page-analytics")) {
    showPage("page-analytics");
    return;
  }
  try {
    await ensureFeatureScripts("analytics");
    if (!isLatestFeatureRoute("analytics", token)) return;
    let renderResult = null;
    if (typeof renderAnalytics === "function") {
      // renderAnalytics mounts its page-shaped skeleton synchronously before
      // its first await. Show that real skeleton instead of a global curtain.
      renderResult = renderAnalytics(() => goToSetup("run"));
    }
    if (isLatestFeatureRoute("analytics", token)) showPage("page-analytics");
    if (renderResult && typeof renderResult.then === "function") await renderResult;
    if (!isLatestFeatureRoute("analytics", token)) return;
    markPageMounted("page-analytics");
    perfMark("route:page-analytics:data-ready");
    if (isLatestFeatureRoute("analytics", token) && isActivePage("page-analytics")) showPage("page-analytics");
  } catch (err) {
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "analytics.render" });
    if (isLatestFeatureRoute("analytics", token)) {
      showPage("page-analytics");
      showFeatureError("page-analytics", "Analytics failed to load", err);
    }
  }
}

async function goToOperations() {
  if (window._teamLeaderEnabled || !(window._kbotAccounts || []).some(account => account && account.accountType !== "static")) {
    goToDashboard();
    return;
  }
  const token = nextFeatureRouteToken("operations");
  perfMark("route:page-operations:click");
  if (canWarmActivate("page-operations")) {
    showPage("page-operations");
    return;
  }
  try {
    await ensureFeatureScripts("operations");
    if (!isLatestFeatureRoute("operations", token)) return;
    let renderResult = null;
    if (typeof renderOperations === "function") {
      // renderOperations also mounts its own page-shaped skeleton before
      // loading data; activate it immediately and keep navigation responsive.
      renderResult = renderOperations(() => goToSetup("run"));
    }
    if (isLatestFeatureRoute("operations", token)) showPage("page-operations");
    if (renderResult && typeof renderResult.then === "function") await renderResult;
    if (!isLatestFeatureRoute("operations", token)) return;
    markPageMounted("page-operations");
    perfMark("route:page-operations:data-ready");
    if (isLatestFeatureRoute("operations", token) && isActivePage("page-operations")) showPage("page-operations");
  } catch (err) {
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "operations.render" });
    if (isLatestFeatureRoute("operations", token)) {
      showPage("page-operations");
      showFeatureError("page-operations", "Operations failed to load", err);
    }
  }
}

async function goToRunResults() {
  if (window._teamLeaderEnabled || !(window._kbotAccounts || []).some(account => account && account.accountType !== "static")) {
    goToDashboard();
    return;
  }
  const token = nextFeatureRouteToken("runResults");
  perfMark("route:page-run-results:click");
  if (canWarmActivate("page-run-results")) {
    showPage("page-run-results");
    return;
  }
  try {
    await ensureFeatureScripts("runResults");
    if (!isLatestFeatureRoute("runResults", token)) return;
    let renderResult = null;
    if (typeof renderRunResults === "function") {
      renderResult = renderRunResults(() => goToSetup("run"));
    }
    if (isLatestFeatureRoute("runResults", token)) showPage("page-run-results");
    if (renderResult && typeof renderResult.then === "function") await renderResult;
    if (!isLatestFeatureRoute("runResults", token)) return;
    markPageMounted("page-run-results");
    perfMark("route:page-run-results:data-ready");
    if (isLatestFeatureRoute("runResults", token) && isActivePage("page-run-results")) showPage("page-run-results");
  } catch (err) {
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "runResults.render" });
    if (isLatestFeatureRoute("runResults", token)) {
      showPage("page-run-results");
      showFeatureError("page-run-results", "Run Results failed to load", err);
    }
  }
}

async function goToNotifications() {
  window._dashboardInitialSection = "notifications";
  if (typeof window.navigateDashboardSection === "function" && window.navigateDashboardSection("notifications")) {
    showPage("page-dashboard");
    return;
  }
  return goToDashboard();
}

async function goToDashboard() {
  const token = nextFeatureRouteToken("dashboard");
  perfMark("route:page-dashboard:click");
  const dashboardState = pageLifecycle("page-dashboard");
  taagerDebugLog("dashboard-route", "goToDashboard:start", {
    token,
    mounted: dashboardState.mounted,
    invalid: dashboardState.invalid,
    hasInitialReady: !!window._dashboardInitialReady
  });
  if (dashboardState.mounted) {
    taagerDebugLog("dashboard-route", "already-mounted:show", {
      invalid: dashboardState.invalid
    });
    showPage("page-dashboard");
    if (!dashboardState.invalid) {
      if (typeof window.syncDashboardMarketingOnOpen === "function") {
        taagerDebugLog("dashboard-route", "already-mounted:sync-start");
        const syncResult = window.syncDashboardMarketingOnOpen();
        if (syncResult && typeof syncResult.then === "function") {
          syncResult.then(() => {
            taagerDebugLog("dashboard-route", "already-mounted:sync-resolved");
            perfMark("route:page-dashboard:data-ready");
            TaagerPerf.measure("route:page-dashboard:click-to-data-ready", "route:page-dashboard:click", "route:page-dashboard:data-ready", { pageId: "page-dashboard", remount: false });
          }).catch((err) => {
            taagerDebugLog("dashboard-route", "already-mounted:sync-rejected", {
              error: err && err.message ? err.message : String(err || "")
            }, "error");
            if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "dashboard.reopenMarketingSync" });
          });
        }
      }
      if (window.prewarmDashboardSections) window.prewarmDashboardSections();
      taagerDebugLog("dashboard-route", "already-mounted:return");
      return;
    }
  }
  // Dashboard owns a richer progress preloader inside its shell. Showing the
  // generic feature loader or route curtain here creates a visible two-loader
  // handoff during cold starts and invalidated-dashboard refreshes.
  taagerDebugLog("dashboard-route", "use-dashboard-preloader", {
    mounted: dashboardState.mounted,
    invalid: dashboardState.invalid
  });
  let initialDashboardSection = window._dashboardInitialSection || "master";
  const dashboardStabilizationLock = beginUiStabilization("dashboard-route");
  const releaseDashboardStabilization = () => {
    taagerDebugLog("dashboard-route", "release-stabilization:scheduled");
    waitForStableUi({ quietMs: 160, maxWaitMs: 1200 })
      .catch(() => {})
      .then(() => {
        taagerDebugLog("dashboard-route", "release-stabilization:now");
        endUiStabilization(dashboardStabilizationLock);
      });
  };
  try {
    taagerDebugLog("dashboard-route", "ensure-dashboard:start");
    setDashboardPreloaderStage("engine", { activity: "Loading dashboard engine" });
    await ensureFeatureScripts("dashboard");
    taagerDebugLog("dashboard-route", "ensure-dashboard:done");
    const dashboardMount = document.getElementById("db-shell-mount");
    initialDashboardSection = (dashboardMount && dashboardMount._dashboardActiveSection) || window._dashboardInitialSection || initialDashboardSection || "master";
    taagerDebugLog("dashboard-route", "ensure-section:start", { initialDashboardSection });
    await window.ensureDashboardSection(initialDashboardSection);
    taagerDebugLog("dashboard-route", "ensure-section:done", { initialDashboardSection });
    setDashboardPreloaderStage("snapshot", { activity: "Reading saved dashboard snapshots" });
    if (!isLatestFeatureRoute("dashboard", token)) {
      taagerDebugLog("dashboard-route", "stale-route-token:return", { token });
      releaseDashboardStabilization();
      return;
    }
    let renderResult = null;
    if (typeof renderDashboard === "function") {
      taagerDebugLog("dashboard-route", "renderDashboard:call");
      renderResult = renderDashboard(() => goToSetup("run"));
      taagerDebugLog("dashboard-route", "renderDashboard:returned", {
        isPromise: !!(renderResult && typeof renderResult.then === "function")
      });
    }
    markPageMounted("page-dashboard");
    taagerDebugLog("dashboard-route", "mark-mounted");
    if (window.prewarmDashboardSections) window.prewarmDashboardSections();
    // renderDashboard() mounts the real dashboard progress preloader
    // synchronously before returning. Activate it now even when navigation
    // started from Setup or another page; requiring it to already be active
    // left the first dashboard click mounted offscreen.
    if (isLatestFeatureRoute("dashboard", token)) showPage("page-dashboard");
    const finishReady = () => {
      taagerDebugLog("dashboard-route", "initial-ready:finish");
      perfMark("route:page-dashboard:data-ready");
      TaagerPerf.measure("route:page-dashboard:click-to-data-ready", "route:page-dashboard:click", "route:page-dashboard:data-ready", { pageId: "page-dashboard" });
      // The selected section is already usable. Prepare the remaining section
      // bundles only after that content has painted, so prewarming cannot delay
      // Setup/Run -> Dashboard navigation.
      afterNextPaint(() => {
        // Fetch local section resources into the browser cache, but do not parse
        // every dormant section. Parsing is deferred to ensureDashboardSection
        // when the user opens that section, avoiding background input stalls.
        if (window.preloadDashboardSectionResources) window.preloadDashboardSectionResources();
      });
    };
    if (renderResult && typeof renderResult.then === "function") {
      renderResult.then(finishReady).catch((err) => {
        taagerDebugLog("dashboard-route", "initial-ready:rejected", {
          error: err && err.message ? err.message : String(err || "")
        }, "error");
        if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "dashboard.initialReady" });
        if (isLatestFeatureRoute("dashboard", token) && isActivePage("page-dashboard")) {
          console.warn("[Dashboard] Initial data readiness failed:", err?.message || err);
        }
      });
      renderResult.then(releaseDashboardStabilization, releaseDashboardStabilization);
    } else {
      finishReady();
      releaseDashboardStabilization();
    }
  } catch (err) {
    taagerDebugLog("dashboard-route", "goToDashboard:error", {
      error: err && err.message ? err.message : String(err || ""),
      stack: err && err.stack ? err.stack : ""
    }, "error");
    releaseDashboardStabilization();
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "dashboard.render" });
    if (isLatestFeatureRoute("dashboard", token)) {
      showPage("page-dashboard");
      showFeatureError("page-dashboard", "Dashboard failed to load", err);
    }
  }
}

async function goToAiIntelligence() {
  if (!window._dashboardEnabled) {
    _renderLockedPage("page-ai-intelligence", "Taager AI", "Taager AI");
    showPage("page-ai-intelligence");
    return;
  }
  const token = nextFeatureRouteToken("ai-intelligence");
  perfMark("route:page-ai-intelligence:click");
  showFeatureLoadingPage("page-ai-intelligence", "Taager AI", "Loading AI intelligence...");
  const curtainToken = showRouteCurtain("Taager AI", "Loading AI intelligence...");
  try {
    await ensureFeatureScripts("dashboard");
    await ensureFeatureScripts("dashboardAi");
    await ensureFeatureScripts("ai");
    if (!isLatestFeatureRoute("ai-intelligence", token)) return;
    showPage("page-ai-intelligence");
    if (typeof renderAiIntelligence === "function") {
      await renderAiIntelligence(() => goToSetup("run"));
    }
    markPageMounted("page-ai-intelligence");
    perfMark("route:page-ai-intelligence:data-ready");
    TaagerPerf.measure("route:page-ai-intelligence:click-to-data-ready", "route:page-ai-intelligence:click", "route:page-ai-intelligence:data-ready", { pageId: "page-ai-intelligence" });
    if (isLatestFeatureRoute("ai-intelligence", token) && isActivePage("page-ai-intelligence")) showPage("page-ai-intelligence");
    hideRouteCurtainWhenStable(curtainToken);
  } catch (err) {
    if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "aiIntelligence.render" });
    if (isLatestFeatureRoute("ai-intelligence", token)) {
      showPage("page-ai-intelligence");
      showFeatureError("page-ai-intelligence", "Taager AI failed to load", err);
      hideRouteCurtainWhenStable(curtainToken);
    }
  }
}

async function renderAiIntelligence() {
  if (!window._dashboardEnabled) {
    _renderLockedPage("page-ai-intelligence", "Taager AI", "Taager AI");
    showPage("page-ai-intelligence");
    return;
  }
  await ensureFeatureScripts("dashboard");
  await ensureFeatureScripts("dashboardAi");
  await ensureFeatureScripts("ai");
  if (typeof window.renderAiIntelligencePage === "function") {
    try {
      await window.renderAiIntelligencePage(() => goToSetup("run"));
    } catch (err) {
      if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(err, { operation: "aiIntelligence.renderPage" });
      throw err;
    }
  }
  showPage("page-ai-intelligence");
}


// Dashboard fetch UI helpers
function _fmtUi(key, values, fallback) {
  let text = window._t ? window._t(key) : key;
  if (!text || text === key) text = fallback || key;
  Object.entries(values || {}).forEach(([name, value]) => {
    text = text.replace(new RegExp("\\{" + name + "\\}", "g"), String(value ?? ""));
  });
  return text;
}

function _renderDashboardStyleUpdateOverlay(state) {
  const overlays = document.querySelectorAll("[data-dashboard-update-overlay]");
  if (!overlays.length) return;
  const esc = TaagerUI && TaagerUI.esc ? TaagerUI.esc : (value) => String(value ?? "");
  overlays.forEach((overlay) => {
    state = state || {};
    const active = !!state.active;
    overlay.hidden = !active;
    overlay.setAttribute("aria-busy", active ? "true" : "false");
    if (!active) {
      overlay.innerHTML = "";
      return;
    }
    overlay.innerHTML = `
      <div class="dashboard-update-panel" role="status">
        <span class="taager-spinner" aria-hidden="true"></span>
        <div class="dashboard-update-copy">
          <strong>${esc(state.title || TaagerUI.t("analytics.uploadedUpdate.loadingTitle", "Updating uploaded orders..."))}</strong>
          <span>${esc(state.body || TaagerUI.t("analytics.uploadedUpdate.loadingBody", "Fetching latest Taager statuses for uploaded orders in the selected range."))}</span>
        </div>
      </div>`;
  });
}

function _setDashboardFetchUi(state) {
  window._dashboardFetchState = state || {};
  if (typeof window.setDashboardUpdateOverlay === "function") {
    window.setDashboardUpdateOverlay(window._dashboardFetchState);
  }
  _renderDashboardStyleUpdateOverlay(window._dashboardFetchState);
  const status = document.getElementById("sv3-dashboard-fetch-status");
  const btn = document.getElementById("dashboard-update-btn");
  const uploadedBtns = document.querySelectorAll(".analytics-uploaded-update-btn");
  const runBtn = document.getElementById("sv3-run-final");
  if (btn) {
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.innerHTML;
    btn.disabled = !!state.active;
    btn.setAttribute("aria-busy", state.active ? "true" : "false");
    btn.innerHTML = state.active
      ? `<span class="taager-spinner" aria-hidden="true"></span> ${TaagerUI.esc(TaagerUI.t("dashboard.fetching_title", "Updating dashboard..."))}`
      : btn.dataset.defaultLabel;
  }
  uploadedBtns.forEach((uploadedBtn) => {
    if (!uploadedBtn.dataset.defaultLabel) uploadedBtn.dataset.defaultLabel = uploadedBtn.innerHTML;
    uploadedBtn.disabled = !!state.active;
    uploadedBtn.setAttribute("aria-busy", state.active ? "true" : "false");
    uploadedBtn.innerHTML = state.active
      ? `<span class="taager-spinner" aria-hidden="true"></span> ${TaagerUI.esc(TaagerUI.t("analytics.uploadedUpdate.loadingShort", "Updating..."))}`
      : uploadedBtn.dataset.defaultLabel;
  });
  if (typeof window.syncDashboardRangeActions === "function") {
    window.syncDashboardRangeActions();
  }
  if (runBtn) runBtn.disabled = !!state.active;
  if (!status) return;

  status.hidden = false;
  status.classList.toggle("is-error", state.kind === "error");
  status.classList.toggle("is-success", state.kind === "success");

  if (state.kind === "hidden") {
    status.hidden = true;
    return;
  }

  if (state.active) {
    const detail = state.childLog || state.stageMessage || window._dashboardFetchLastChildLog || "";
    status.innerHTML = `
      <div class="taager-spinner" aria-hidden="true"></div>
      <div>
        <strong>${TaagerUI.esc(state.title || TaagerUI.t("dashboard.fetching_title", "Updating dashboard..."))}</strong>
        <span>${TaagerUI.esc(state.body || TaagerUI.t("dashboard.fetching_body", "Fetching orders, refreshing product data, and matching ad spend across accounts. This can take a few minutes; keep the app open."))}</span>
        ${detail ? `<span style="display:block;margin-top:6px;color:var(--text3);font-size:var(--type-label);direction:ltr;text-align:left;unicode-bidi:plaintext;">${TaagerUI.esc(detail)}</span>` : ""}
      </div>
    `;
    return;
  }

  const icon = state.kind === "error" ? "!" : "i";
  status.innerHTML = `
    <div class="taager-state-icon" aria-hidden="true">${icon}</div>
    <div>
      <strong>${TaagerUI.esc(state.title || "")}</strong>
      <span>${TaagerUI.esc(state.body || "")}</span>
    </div>
    ${state.retryIds ? `
      <div class="sv3-dashboard-fetch-actions">
        <button class="btn btn-primary" type="button" id="sv3-dashboard-retry-btn">${TaagerUI.esc(TaagerUI.t("dashboard.fetch_retry", "Try again"))}</button>
        <button class="btn btn-ghost" type="button" id="sv3-dashboard-open-btn">${TaagerUI.esc(TaagerUI.t("dashboard.fetch_open", "Open dashboard"))}</button>
      </div>
    ` : ""}
  `;
  document.getElementById("sv3-dashboard-retry-btn")?.addEventListener("click", () => _onRunForDashboard(state.retryIds));
  document.getElementById("sv3-dashboard-open-btn")?.addEventListener("click", () => goToDashboard());
}

// ── Manual "Update Dashboard" button handler ──────────────────────────────
// Fetches the selected dashboard scope, then refreshes connected marketing data.
// Opening or filtering the Dashboard never invokes this live-update path.
function _dashboardFetchUserError(error) {
  const text = String(error || "UNKNOWN_ERROR");
  if (text.includes("DASHBOARD_ACCOUNT_BROWSER_CLOSED")) {
    return "Chrome was closed for this account; moved to the next account.";
  }
  return text;
}

async function _onRunForDashboard(selectedAccountIds, period, options) {
  const shouldMarkBusy = !window._botIsRunning;
  if (shouldMarkBusy) {
    window._botIsRunning = true;
    if (window.api && typeof window.api.botStarted === "function") window.api.botStarted();
  }
  try {
    return await _runDashboardUpdate(selectedAccountIds, period, options);
  } finally {
    if (shouldMarkBusy) {
      window._botIsRunning = false;
      if (window.api && typeof window.api.botFinished === "function") window.api.botFinished();
    }
  }
}

async function _runDashboardUpdate(selectedAccountIds, period, options) {
  options = options || {};
  if (!window._dashboardEnabled) {
    goToDashboard(); // opens Dashboard preview mode
    return;
  }
  let ids = Array.isArray(selectedAccountIds) ? selectedAccountIds.filter(Boolean) : [];

  let totalRows = 0;
  const failures = [];
  const enrichmentWarnings = [];
  let successCount = 0;
  let marketingResult = { attempted: false, ok: true, error: "" };
  const range = period || (window.DashboardPeriodState ? window.DashboardPeriodState.get() : null);
  try {
    if (window.api && typeof window.api.getCredentials === "function") {
      const freshCreds = await window.api.getCredentials();
      if (freshCreds && Array.isArray(freshCreds.accounts)) {
        window._kbotAccounts = freshCreds.accounts;
        if (!ids.length) ids = freshCreds.accounts.map((acc) => acc && acc.id).filter(Boolean);
      }
    }
  } catch (e) {
    console.warn("[Dashboard] Could not refresh account credentials before manual fetch:", e.message);
  }
  if (!ids.length) {
    TaagerUI.toast(TaagerUI.t("dashboard.fetch_error_body", "Select at least one account before updating the dashboard."), { kind: "error" });
    return;
  }
  const accountLabels = new Map((window._kbotAccounts || window.dashboardAccountsList || []).map((acc) => [
    acc.id || acc.value,
    acc.memberName || acc.lightfunnelsAccountName || acc.easyStore || acc.storeName || acc.label || acc.name || acc.lightfunnelsEmail || acc.easyEmail || acc.email || acc.taagerEmail || acc.id || acc.value
  ]));
  window._dashboardFetchLastChildLog = "";
  let dashboardFetchLastActivityAt = Date.now();
  let dashboardFetchQuietNoticeTimer = null;
  const markDashboardFetchActivity = () => {
    dashboardFetchLastActivityAt = Date.now();
  };
  const stopDashboardFetchQuietNotice = () => {
    if (dashboardFetchQuietNoticeTimer) clearInterval(dashboardFetchQuietNoticeTimer);
    dashboardFetchQuietNoticeTimer = null;
  };
  if (window.api && typeof window.api.removeAllListeners === "function") {
    window.api.removeAllListeners("bot-2fa-needed");
    window.api.removeAllListeners("bot-dashboard-log");
    window.api.removeAllListeners("bot-dashboard-stage");
  }
  const dashboardLogHandler = (payload) => {
    if (!payload || ids.indexOf(payload.accountId) === -1) return;
    const message = String(payload.message || "").trim();
    if (!message) return;
    markDashboardFetchActivity();
    window._dashboardFetchLastChildLog = `${payload.accountLabel || payload.accountId}: ${message}`;
    console.log(`[Dashboard child] ${window._dashboardFetchLastChildLog}`);
    if (window._dashboardFetchState && window._dashboardFetchState.active) {
      _setDashboardFetchUi({
        ...window._dashboardFetchState,
        childLog: window._dashboardFetchLastChildLog
      });
    }
  };
  const dashboardStageHandler = (payload) => {
    if (!payload || ids.indexOf(payload.accountId) === -1) return;
    markDashboardFetchActivity();
    const stageText = `${payload.accountLabel || payload.accountId}: ${payload.stage || payload.lastStage || "dashboard"} ${payload.status ? `(${payload.status})` : ""}${payload.message ? ` - ${payload.message}` : ""}`;
    window._dashboardFetchLastChildLog = stageText;
    console.log("[Dashboard stage]", payload);
    if (window._dashboardFetchState && window._dashboardFetchState.active) {
      _setDashboardFetchUi({
        ...window._dashboardFetchState,
        stageMessage: stageText
      });
    }
  };
  if (window.api && typeof window.api.onDashboardLog === "function") {
    window.api.onDashboardLog(dashboardLogHandler);
  } else if (window.api && typeof window.api.on === "function") {
    window.api.on("bot-dashboard-log", dashboardLogHandler);
  }
  if (window.api && typeof window.api.onDashboardStage === "function") {
    window.api.onDashboardStage(dashboardStageHandler);
  } else if (window.api && typeof window.api.on === "function") {
    window.api.on("bot-dashboard-stage", dashboardStageHandler);
  }
  if (window.api && typeof window.api.on2faNeeded === "function") {
    window.api.on2faNeeded((message) => {
      const accountLabel = message && (message.accountLabel || accountLabels.get(message.accountId));
      const body = TaagerUI.t(
        "dashboard.fetching_2fa",
        "Complete the EasyOrders verification code in the browser window. Dashboard Update will continue automatically."
      );
      _setDashboardFetchUi({
        active: true,
        title: TaagerUI.t("run.2fa_title", "2FA Required"),
        body: accountLabel ? `${accountLabel}: ${body}` : body
      });
      TaagerUI.toast(body, { kind: "info", timeout: 12000 });
    });
  }
  _setDashboardFetchUi({
    active: true,
    title: TaagerUI.t("dashboard.fetching_title", "Updating dashboard..."),
    body: TaagerUI.t("dashboard.fetching_body", "Fetching live Taager data. This may take a few minutes. Keep the app open.")
  });
  dashboardFetchQuietNoticeTimer = setInterval(() => {
    if (!window._dashboardFetchState || !window._dashboardFetchState.active) return;
    const quietSeconds = Math.round((Date.now() - dashboardFetchLastActivityAt) / 1000);
    if (quietSeconds < 90) return;
    const detail = `Still working. No new browser update for ${quietSeconds}s. Last detail: ${window._dashboardFetchLastChildLog || "dashboard fetch started"}`;
    console.warn("[Dashboard] Fetch quiet notice:", detail);
    _setDashboardFetchUi({
      ...window._dashboardFetchState,
      childLog: detail
    });
    dashboardFetchLastActivityAt = Date.now();
  }, 30000);

  for (let i = 0; i < ids.length; i++) {
    const accountId = ids[i];
    try {
      console.log(`[Dashboard] Manual fetch for ${accountId}...`);
      markDashboardFetchActivity();
      _setDashboardFetchUi({
        active: true,
        title: TaagerUI.t("dashboard.fetching_title", "Updating dashboard..."),
        body: _fmtUi("dashboard.fetching_account", { current: i + 1, total: ids.length, account: accountLabels.get(accountId) || accountId }, `Updating ${i + 1} of ${ids.length}: ${accountLabels.get(accountId) || accountId}`)
      });
      const fetchRes = await window.api.runDashboardFetch({
        accountId,
        dateFrom: range?.dateFrom,
        dateTo: range?.dateTo
      });
      markDashboardFetchActivity();
      if (fetchRes?.success) {
        totalRows += Number(fetchRes.rows || 0);
        successCount += 1;
        console.log(`[Dashboard] Manual fetch done for ${accountId}: ${fetchRes.rows} rows`);
        if (fetchRes.debugSummary) {
          console.log(`[Dashboard] Manual fetch debug for ${accountId}:`, fetchRes.debugSummary);
        }
        if (fetchRes.enrichmentDiagnostics &&
            fetchRes.enrichmentDiagnostics.provider === "easyorders" &&
            fetchRes.enrichmentDiagnostics.status !== "ok") {
          enrichmentWarnings.push({
            accountId,
            label: accountLabels.get(accountId) || accountId,
            status: fetchRes.enrichmentDiagnostics.status || "missing",
            error: fetchRes.enrichmentDiagnostics.error || ""
          });
        }
      } else {
        const recentLogs = Array.isArray(fetchRes && fetchRes.recentLogs) && fetchRes.recentLogs.length
          ? ` Recent logs: ${fetchRes.recentLogs.slice(-3).join(" | ")}`
          : "";
        failures.push({ accountId, label: accountLabels.get(accountId) || accountId, error: _dashboardFetchUserError(fetchRes?.error || "UNKNOWN_ERROR") + recentLogs });
        console.warn(`[Dashboard] Manual fetch failed for ${accountId}:`, fetchRes?.error);
      }
    } catch (e) {
      markDashboardFetchActivity();
      failures.push({ accountId, label: accountLabels.get(accountId) || accountId, error: _dashboardFetchUserError(e.message || "UNKNOWN_ERROR") });
      console.warn(`[Dashboard] Manual fetch error for ${accountId}:`, e.message);
      if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(e, {
        operation: "dashboard.manualFetch.account",
        accountId,
      });
    }
  }
  stopDashboardFetchQuietNotice();
  if (window.api && typeof window.api.removeAllListeners === "function") {
    window.api.removeAllListeners("bot-2fa-needed");
    window.api.removeAllListeners("bot-dashboard-log");
    window.api.removeAllListeners("bot-dashboard-stage");
  }

  const marketingStore = window.DashboardMarketingState;
  const marketingAccountId = String(options.marketingAccountId || (ids.length === 1 ? ids[0] : "__all__"));
  if (marketingStore && typeof marketingStore.sync === "function" && range?.dateFrom && range?.dateTo) {
    const roi = window.DashboardRoiState && typeof window.DashboardRoiState.get === "function"
      ? window.DashboardRoiState.get(marketingAccountId)
      : {};
    const marketingPayload = {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      targetCurrency: roi.currency || window.dashboardActiveCurrency || "SAR",
      egpRate: window.TaagerCurrency && typeof window.TaagerCurrency.rates === "function"
        ? Number((window.TaagerCurrency.rates() || {}).EGP) || Number(roi.egpRate) || 52
        : Number(roi.egpRate) || 52,
      exchangeRates: window.TaagerCurrency && typeof window.TaagerCurrency.rates === "function"
        ? window.TaagerCurrency.rates()
        : {}
    };
    try {
      _setDashboardFetchUi({
        active: true,
        title: TaagerUI.t("dashboard.fetching_title", "Updating dashboard..."),
        body: "Refreshing connected marketing spend for the selected period..."
      });
      const status = typeof marketingStore.load === "function"
        ? await marketingStore.load(marketingAccountId)
        : (typeof marketingStore.get === "function" ? marketingStore.get(marketingAccountId) : null);
      const connected = !!(status && status.status === "connected");
      if (connected) {
        marketingResult.attempted = true;
        const synced = await marketingStore.sync(marketingAccountId, marketingPayload);
        marketingResult.ok = !(synced && synced.error);
        marketingResult.error = synced && synced.error ? String(synced.error) : "";
      }
    } catch (error) {
      marketingResult = { attempted: true, ok: false, error: error.message || String(error) };
      console.warn("[Dashboard] Explicit marketing refresh failed:", marketingResult.error);
      if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(error, {
        operation: "dashboard.manualFetch.marketing",
        accountId: marketingAccountId,
      });
    }
  }

  const anyLiveStageSucceeded = successCount > 0 || (marketingResult.attempted && marketingResult.ok);
  const hasWarnings = failures.length > 0 || enrichmentWarnings.length > 0 || !marketingResult.ok;
  const warningParts = [];
  if (failures.length) warningParts.push(`Taager failed: ${failures.map(f => `${f.label || f.accountId}: ${f.error || "unknown error"}`).join(", ")}`);
  if (enrichmentWarnings.length) warningParts.push(`EasyOrders enrichment unavailable: ${enrichmentWarnings.map(item => `${item.label}${item.error ? `: ${item.error}` : ""}`).join(", ")}`);
  if (!marketingResult.ok) warningParts.push(`Marketing failed: ${marketingResult.error || "sync failed"}`);

  if (!anyLiveStageSucceeded) {
    const body = warningParts.join(". ") || TaagerUI.t("dashboard.fetch_error_body", "Dashboard update failed.");
    _setDashboardFetchUi({
      kind: "error",
      title: TaagerUI.t("dashboard.fetch_error_title", "Dashboard update failed"),
      body,
      retryIds: ids
    });
    TaagerUI.toast(body, { kind: "error", timeout: 9000 });
  } else if (hasWarnings) {
    const failedIds = failures.map(f => f.accountId);
    const partialBody = _fmtUi(
      failures.length ? "dashboard.fetch_partial_body" : "dashboard.fetch_partial_clean_body",
      { count: totalRows, success: successCount, total: ids.length, failed: failures.map(f => f.label || f.accountId).join(", ") },
      `Fetched ${totalRows} orders from ${successCount} of ${ids.length} account(s).`
    ) + (warningParts.length ? ` ${warningParts.join(". ")}.` : "");
    _setDashboardFetchUi({
      kind: "error",
      title: TaagerUI.t("dashboard.fetch_partial", "Dashboard partially updated"),
      body: partialBody,
      retryIds: failedIds.length ? failedIds : undefined
    });
    TaagerUI.toast(partialBody, { kind: "error", timeout: 9000 });
  } else {
    _setDashboardFetchUi({
      kind: "success",
      title: TaagerUI.t("dashboard.fetch_success", "Dashboard updated"),
      body: _fmtUi("dashboard.fetch_success_body", { count: totalRows, total: ids.length }, `Fetched ${totalRows} orders across ${ids.length} account(s).`) +
        (marketingResult.attempted ? " Marketing spend refreshed." : "")
    });
    TaagerUI.toast(TaagerUI.t("dashboard.fetch_success", "Dashboard updated"), { kind: "success" });
  }

  if (window.invalidateDashboardCache) window.invalidateDashboardCache();
  invalidatePage("page-dashboard", "explicit-update");
  if (options.stayOnDashboard && typeof window.refreshDashboard === "function" && document.getElementById("db-shell-mount")) {
    await window.refreshDashboard();
    markPageMounted("page-dashboard");
  } else if (options.stayOnDashboard && typeof renderDashboard === "function") {
    await ensureFeatureScripts("dashboard");
    await renderDashboard(() => goToSetup("run"));
    markPageMounted("page-dashboard");
  } else {
    goToDashboard();
  }
  return {
    success: anyLiveStageSucceeded,
    totalRows,
    successCount,
    failures,
    enrichmentWarnings,
    marketing: marketingResult
  };
}
window._onRunForDashboard = _onRunForDashboard;

async function _onUpdateUploadedOrdersForAnalytics(options) {
  options = options || {};
  const ids = Array.from(new Set((Array.isArray(options.accountIds) ? options.accountIds : []).filter(Boolean)));
  const dateFrom = options.dateFrom || "";
  const dateTo = options.dateTo || "";
  if (!ids.length) {
    TaagerUI.toast(TaagerUI.t("analytics.uploadedUpdate.none", "No uploaded orders found in the selected range."), { kind: "info" });
    return { success: false, skipped: true };
  }

  const accountLabels = new Map((window._kbotAccounts || window.dashboardAccountsList || []).map((acc) => [
    acc.id || acc.value,
    acc.memberName || acc.lightfunnelsAccountName || acc.easyStore || acc.storeName || acc.label || acc.name || acc.lightfunnelsEmail || acc.easyEmail || acc.email || acc.taagerEmail || acc.id || acc.value
  ]));
  window._dashboardFetchLastChildLog = "";

  if (window.api && typeof window.api.removeAllListeners === "function") {
    window.api.removeAllListeners("bot-2fa-needed");
    window.api.removeAllListeners("bot-dashboard-log");
    window.api.removeAllListeners("bot-dashboard-stage");
  }

  const updateProgress = (detail) => {
    if (!detail || !window._dashboardFetchState || !window._dashboardFetchState.active) return;
    _setDashboardFetchUi({
      ...window._dashboardFetchState,
      childLog: detail
    });
  };
  const dashboardLogHandler = (payload) => {
    if (!payload || ids.indexOf(payload.accountId) === -1) return;
    const message = String(payload.message || "").trim();
    if (!message) return;
    window._dashboardFetchLastChildLog = `${payload.accountLabel || payload.accountId}: ${message}`;
    updateProgress(window._dashboardFetchLastChildLog);
  };
  const dashboardStageHandler = (payload) => {
    if (!payload || ids.indexOf(payload.accountId) === -1) return;
    const stageText = `${payload.accountLabel || payload.accountId}: ${payload.stage || payload.lastStage || "uploaded orders"} ${payload.status ? `(${payload.status})` : ""}${payload.message ? ` - ${payload.message}` : ""}`;
    window._dashboardFetchLastChildLog = stageText;
    updateProgress(stageText);
  };
  if (window.api && typeof window.api.onDashboardLog === "function") {
    window.api.onDashboardLog(dashboardLogHandler);
  } else if (window.api && typeof window.api.on === "function") {
    window.api.on("bot-dashboard-log", dashboardLogHandler);
  }
  if (window.api && typeof window.api.onDashboardStage === "function") {
    window.api.onDashboardStage(dashboardStageHandler);
  } else if (window.api && typeof window.api.on === "function") {
    window.api.on("bot-dashboard-stage", dashboardStageHandler);
  }
  if (window.api && typeof window.api.on2faNeeded === "function") {
    window.api.on2faNeeded((message) => {
      const body = TaagerUI.t("dashboard.fetching_2fa", "Complete the EasyOrders verification code in the browser window. Dashboard Update will continue automatically.");
      const accountLabel = message && (message.accountLabel || accountLabels.get(message.accountId));
      _setDashboardFetchUi({
        active: true,
        title: TaagerUI.t("run.2fa_title", "2FA Required"),
        body: accountLabel ? `${accountLabel}: ${body}` : body
      });
      TaagerUI.toast(body, { kind: "info", timeout: 12000 });
    });
  }

  _setDashboardFetchUi({
    active: true,
    title: TaagerUI.t("analytics.uploadedUpdate.loadingTitle", "Updating uploaded orders..."),
    body: TaagerUI.t("analytics.uploadedUpdate.loadingBody", "Fetching latest Taager statuses for uploaded orders in the selected range.")
  });

  let totalRows = 0;
  let enriched = 0;
  let successCount = 0;
  const failures = [];

  for (let i = 0; i < ids.length; i++) {
    const accountId = ids[i];
    const label = accountLabels.get(accountId) || accountId;
    try {
      _setDashboardFetchUi({
        active: true,
        title: TaagerUI.t("analytics.uploadedUpdate.loadingTitle", "Updating uploaded orders..."),
        body: _fmtUi("analytics.uploadedUpdate.account", { current: i + 1, total: ids.length, account: label }, `Updating uploaded orders ${i + 1} of ${ids.length}: ${label}`)
      });
      const fetchRes = await window.api.runDashboardFetch({
        accountId,
        dateFrom,
        dateTo,
        analyticsOnly: true,
        uploadedOnly: true
      });
      if (fetchRes && fetchRes.success) {
        successCount += 1;
        totalRows += Number(fetchRes.rows || 0);
        enriched += Number(fetchRes.enriched || 0);
      } else {
        failures.push({ accountId, label, error: fetchRes && fetchRes.error || "UNKNOWN_ERROR" });
      }
    } catch (error) {
      failures.push({ accountId, label, error: error.message || String(error) });
      if (window.TaagerMonitoring) window.TaagerMonitoring.captureException(error, {
        operation: "analytics.uploadedOrdersUpdate.account",
        accountId,
      });
    }
  }

  if (window.api && typeof window.api.removeAllListeners === "function") {
    window.api.removeAllListeners("bot-2fa-needed");
    window.api.removeAllListeners("bot-dashboard-log");
    window.api.removeAllListeners("bot-dashboard-stage");
  }

  const partial = successCount > 0 && failures.length > 0;
  const result = { success: successCount > 0, partial, totalRows, enriched, successCount, failures };
  if (result.success) {
    window.dispatchEvent(new CustomEvent("taager-analytics-runs-updated"));
    if (typeof options.onComplete === "function") {
      await options.onComplete(result);
    }
  }

  if (!result.success) {
    const body = failures.map(f => `${f.label}: ${f.error}`).join(", ") || TaagerUI.t("analytics.uploadedUpdate.errorBody", "Uploaded orders update failed.");
    _setDashboardFetchUi({
      kind: "error",
      title: TaagerUI.t("analytics.uploadedUpdate.errorTitle", "Uploaded orders update failed"),
      body
    });
    TaagerUI.toast(body, { kind: "error", timeout: 9000 });
  } else if (partial) {
    const body = _fmtUi(
      "analytics.uploadedUpdate.partialBody",
      { count: enriched, success: successCount, total: ids.length },
      `Updated ${enriched} uploaded orders from ${successCount} of ${ids.length} account(s). Some accounts failed.`
    );
    _setDashboardFetchUi({
      kind: "error",
      title: TaagerUI.t("analytics.uploadedUpdate.partialTitle", "Uploaded orders partially updated"),
      body
    });
    TaagerUI.toast(body, { kind: "error", timeout: 9000 });
  } else {
    const body = enriched > 0
      ? _fmtUi("analytics.uploadedUpdate.successBody", { count: enriched }, `Updated ${enriched} uploaded orders. Status and revenue refreshed.`)
      : TaagerUI.t("analytics.uploadedUpdate.noChanges", "Uploaded orders are already up to date.");
    _setDashboardFetchUi({
      kind: "success",
      title: TaagerUI.t("analytics.uploadedUpdate.successTitle", "Uploaded orders updated"),
      body
    });
    TaagerUI.toast(body, { kind: "success" });
  }
  return result;
}
window._onUpdateUploadedOrdersForAnalytics = _onUpdateUploadedOrdersForAnalytics;

// ── Re-render current page when language switches ──
async function reRenderCurrentPage() {
  const active = document.querySelector(".page.active");
  if (!active) return;
  const id = active.id;
  if (id === "page-setup") {
    // Use in-place re-render if the setup page registered one (preserves step/state).
    // Fall back to full goToSetup() only when no in-place renderer is registered.
    if (typeof window._renderSetupInPlace === "function") {
      window._renderSetupInPlace();
    } else {
      goToSetup();
    }
  } else if (id === "page-run") {
    // Do NOT re-render the run page while the bot is active —
    // tearing down the DOM mid-run destroys all IPC listeners and crashes the UI.
    // Instead, just update the translatable text elements in place.
    updateRunPageTranslations();
  } else if (id === "page-results" && typeof window._lastResultArgs === "object" && window._lastResultArgs) {
    const { data, dateFrom, dateTo, onRunAgain, onHome } = window._lastResultArgs;
    try { renderResults(data, dateFrom, dateTo, onRunAgain, onHome); } catch(e) {}
  } else if (id === "page-license") {
    // Re-render license page in place so labels switch language
    if (typeof window._renderLicenseInPlace === "function") window._renderLicenseInPlace();
  } else if (id === "page-dashboard") {
    // Language changes do not alter dashboard data. Reuse the current snapshot
    // and rebuild only the cached UI panes instead of restarting aggregation.
    const shellMount = document.getElementById("db-shell-mount");
    if (shellMount && shellMount._dashboardCurrentData && typeof window.refreshDashboardShell === "function") {
      shellMount._dashboardPaneDataVersion = null;
      shellMount._dashboardPaneScopeKey = null;
      window.refreshDashboardShell(shellMount, shellMount._dashboardCurrentData);
      markPageMounted("page-dashboard");
    } else {
      await ensureFeatureScripts("dashboard");
      if (typeof renderDashboard === "function") await renderDashboard();
      markPageMounted("page-dashboard");
    }
  } else if (id === "page-ai-intelligence") {
    await ensureFeatureScripts("dashboard");
    if (typeof renderAiIntelligence === "function") await renderAiIntelligence();
  } else if (id === "page-notifications") {
    if (typeof renderNotifications === "function") await renderNotifications();
    markPageMounted("page-notifications");
  } else if (id === "page-analytics") {
    invalidatePage("page-analytics", "language");
    await ensureFeatureScripts("analytics");
    if (typeof renderAnalytics === "function") await renderAnalytics(() => goToSetup("run"));
    markPageMounted("page-analytics");
  } else if (id === "page-operations") {
    invalidatePage("page-operations", "language");
    await ensureFeatureScripts("operations");
    if (typeof renderOperations === "function") await renderOperations(() => goToSetup("run"));
    markPageMounted("page-operations");
  } else if (id === "page-run-results") {
    invalidatePage("page-run-results", "language");
    await ensureFeatureScripts("runResults");
    if (typeof renderRunResults === "function") await renderRunResults(() => goToSetup("run"));
    markPageMounted("page-run-results");
  }
}

window.addEventListener("taager-analytics-runs-updated", () => {
  invalidatePage("page-analytics", "runs-updated");
  invalidatePage("page-operations", "runs-updated");
});

window.addEventListener("taager-run-results-updated", () => {
  invalidatePage("page-run-results", "run-results-updated");
});

window.addEventListener("taager-product-names-change", () => {
  invalidatePage("page-dashboard", "product-names");
});

// ── Lightweight translation update for the run page (no DOM teardown) ──
function updateRunPageTranslations() {
  const t = window._t;

  // 1. Flip document direction & lang
  document.documentElement.setAttribute("dir",  window._kbotLang === "ar" ? "rtl" : "ltr");
  document.documentElement.setAttribute("lang", window._kbotLang);

  // 2. All elements with data-i18n — plain string keys only
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (typeof val === "string") el.textContent = val;
  });

  // 3. Phase labels that are still in "waiting" state — update their text
  //    (active/done phases get their text set dynamically by setPhaseActive/updatePhases,
  //     so we only touch ones still showing the generic waiting string)
  for (let i = 0; i < 5; i++) {
    const lbl = document.getElementById(`phase-label-${i}`);
    if (!lbl) continue;
    // Only update if this phase hasn't started yet (dot has no active/done class)
    const dot = document.getElementById(`dot-${i}`);
    if (dot && !dot.classList.contains("active") && !dot.classList.contains("done")) {
      lbl.textContent = t("run.waiting");
    }
  }

  // 4. Refresh top bar text
  updateTopBarText();
}

// Start
init();
