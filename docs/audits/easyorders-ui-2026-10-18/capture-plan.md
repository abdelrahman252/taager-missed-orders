# Safe live capture plan

Use only the already authenticated IAB tab. Capture small relevant subtrees, not full page HTML. Before saving, remove or replace all customer/store text, emails, phone/order IDs, input values, href/query strings, cookies, and storage. Keep element names, roles, labels, stable data attributes, and relevant class names.

For each capture, include current route and language direction, then `outerHTML` for the smallest useful subtree:

1. `#/login`: form controls only. Do not submit. (Captured in `fixtures/login-form.html`.)
2. `#/store-selection`: title and one sanitized store-card/button structure. Do not select a store.
3. Account/settings: trigger element and role-dialog/popover subtree; replace identity text with placeholders. Do not open store-switch or sign-out actions.
4. Language menu: trigger and menu item labels/roles; may open and restore original language.
5. `#/orders` and `#/missed-orders`: toolbar Export button outerHTML; Add Filter trigger and open option menu. Do not apply a filter unless needed for read-only inspection.
6. Export dialog: dialog heading, readonly range input attributes, modal Export button. Open date range popover; capture the root, visible month captions, nav buttons, endpoint cells, footer Apply. Apply only if needed to confirm UI commit, and preserve the existing dates. Never click modal Export during this audit.
7. Notifications: two matching-kind rows with link count and safe href summary (`origin + pathname extension only`); replace all visible text and any IDs. Do not trigger a new export.
8. Real and missed detail: a redacted detail action toolbar/menu, then if opening an edit dialog is safe, capture field labels/name attributes only and close with Cancel. Do not Save, resend, or Convert.

## Suggested sanitized browser-side extractor

Adapt per selected root; do not print full text or raw hrefs:

```js
el.outerHTML
  .replace(/(value|data-[^=]*|href)="[^"]*"/gi, '$1="[redacted]"')
  .replace(/>([^<]{20,})</g, '>[redacted] <');
```

This is a starting point only: attribute values that are structural (for example `data-mode`, `data-day`, `name`, `role`, `aria-label`) should be retained when non-identifying. Remove identifying text/attributes manually before saving.
