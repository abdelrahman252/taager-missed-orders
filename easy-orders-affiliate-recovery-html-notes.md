# EasyOrders Affiliate Recovery HTML Notes

This file is the working HTML evidence log for the planned EasyOrders affiliate recovery flow.

Goal: collect the real DOM snippets first, then derive stable selectors and behavior notes before writing automation code.

## Flow Draft

1. Open EasyOrders orders page: `https://app.easy-orders.net/#/orders`.
2. Apply the selected date range using the EasyOrders filter UI.
3. Set pagination to 100 rows per page.
4. Scrape table pages as discovery rows.
5. Open candidate order detail pages.
6. Verify the detail order matches the table row.
7. Edit only when needed.
8. Click `Resend Order to Affiliates` for real orders.
9. Repeat equivalent flow for missed orders, using `Convert to Order`.

## Selector Principles

- Prefer semantic selectors first: role, accessible name, visible button text, table headers.
- Avoid generated Material UI class names such as `muiltr-new-*`.
- Use generated classes only as weak context clues, never as the primary selector.
- Every row action should be verified on the detail page before clicking resend/convert.
- Any uncertain post-click state should be marked `unverified`; do not retry destructive actions blindly.

## Orders Page

URL:

```text
https://app.easy-orders.net/#/orders
```

### Add Filter Button

Raw HTML:

```html
<div class="muiltr-new-1baulvz">
  <button class="MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeSmall MuiButton-textSizeSmall add-filter muiltr-new-ewqyyo" tabindex="0" type="button" aria-label="add filter" aria-haspopup="true" fdprocessedid="mlhoq">
    <span class="MuiButton-startIcon MuiButton-iconSizeSmall muiltr-new-16rzsu1">
      <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium muiltr-new-vubbuv" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="FilterListIcon">
        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"></path>
      </svg>
    </span>
    add filter
    <span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span>
  </button>
</div>
```

Stable selector candidates:

```js
page.getByRole("button", { name: /add filter/i })
page.locator('button[aria-label="add filter"]')
page.locator('button.add-filter').filter({ hasText: /add filter/i })
```

Preferred selector:

```js
page.getByRole("button", { name: /add filter/i })
```

Fallback selector:

```js
page.locator('button[aria-label="add filter"], button.add-filter:has-text("add filter")').first()
```

Notes:

- `aria-label="add filter"` is strong.
- Visible text `add filter` is also strong in English mode.
- `aria-haspopup="true"` confirms the button opens a filter menu/popover.
- Ignore `muiltr-new-*` and `fdprocessedid`; those are generated/unstable.

### Add Filter Menu

After clicking `add filter`, a Material UI menu opens with filter choices.

Raw HTML:

```html
<div class="MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation1 MuiPaper-root MuiMenu-paper MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation8 MuiPopover-paper muiltr-new-z92fow" tabindex="-1" style="opacity: 1; transform: none; transition: opacity 333ms cubic-bezier(0.4, 0, 0.2, 1), transform 222ms cubic-bezier(0.4, 0, 0.2, 1); top: 323px; left: 1051px; transform-origin: 201px 0px;">
  <ul class="MuiList-root MuiList-padding MuiMenu-list muiltr-new-r8u8y9" role="menu" tabindex="-1">
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="short_id"><span>Short ID</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="full_name"><span>Customer Name</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="phone"><span>Customer Phone Number</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="address"><span>Customer Address</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="created_at$gte"><span>Start Date</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="created_at$lte"><span>End Date</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="utm_source"><span>Campaign Source</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="utm_campaign"><span>Campaign Name</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="coupon_code"><span>Coupon</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="product_id$eq"><span>Product</span><span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
  </ul>
</div>
```

Stable selector candidates:

```js
page.getByRole("menuitem", { name: "Start Date" })
page.getByRole("menuitem", { name: "End Date" })
page.locator('[role="menuitem"][data-key="created_at$gte"]')
page.locator('[role="menuitem"][data-key="created_at$lte"]')
```

Preferred selectors:

```js
page.locator('[role="menuitem"][data-key="created_at$gte"]').first()
page.locator('[role="menuitem"][data-key="created_at$lte"]').first()
```

Fallback selectors:

```js
page.getByRole("menuitem", { name: /^Start Date$/i })
page.getByRole("menuitem", { name: /^End Date$/i })
```

Notes:

- `data-key="created_at$gte"` and `data-key="created_at$lte"` are strong because they encode the actual filter fields.
- The menu closes after selecting one item, so add Start Date, reopen `add filter`, then add End Date.
- Do not rely on the popover position, inline style, or generated Material UI classes.

### Start Date Filter Field

Raw HTML before a value is filled:

```html
<div data-source="created_at$gte" class="filter-field RaFilterForm-filterFormInput muiltr-new-n6qaps">
  <button class="MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeSmall hide-filter RaFilterFormInput-hideButton muiltr-new-xfvph6" tabindex="0" type="button" data-key="created_at$gte" title="Remove this filter" fdprocessedid="lqpn2">
    <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium muiltr-new-vubbuv" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="HighlightOffIcon">
      <path d="M14.59 8 12 10.59 9.41 8 8 9.41 10.59 12 8 14.59 9.41 16 12 13.41 14.59 16 16 14.59 13.41 12 16 9.41 14.59 8zM12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path>
    </svg>
    <span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span>
  </button>
  <div class="MuiFormControl-root MuiFormControl-fullWidth MuiTextField-root ra-input ra-input-created_at$gte muiltr-new-17j3rpk">
    <label class="MuiFormLabel-root MuiInputLabel-root MuiInputLabel-formControl MuiInputLabel-animated MuiInputLabel-shrink MuiInputLabel-sizeSmall MuiInputLabel-outlined MuiFormLabel-colorPrimary muiltr-new-1yt8nca" data-shrink="true" for="created_at$gte" id="created_at$gte-label"><span>Start Date</span></label>
    <div class="MuiInputBase-root MuiOutlinedInput-root MuiInputBase-colorPrimary MuiInputBase-fullWidth MuiInputBase-formControl MuiInputBase-sizeSmall muiltr-new-chjfow">
      <input aria-invalid="false" aria-describedby="created_at$gte-helper-text" id="created_at$gte" name="created_at$gte" type="date" class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputSizeSmall muiltr-new-17opruk" value="">
      <fieldset aria-hidden="true" class="MuiOutlinedInput-notchedOutline muiltr-new-nqlg3w"><legend class="muiltr-new-14lo706"><span><span>Start Date</span></span></legend></fieldset>
    </div>
    <p class="MuiFormHelperText-root MuiFormHelperText-sizeSmall MuiFormHelperText-contained muiltr-new-krn6c9" id="created_at$gte-helper-text"></p>
  </div>
  <div class="RaFilterFormInput-spacer">&nbsp;</div>
</div>
```

Raw HTML after value is filled:

```html
<input aria-invalid="false" aria-describedby="created_at$gte-helper-text" id="created_at$gte" name="created_at$gte" type="date" class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputSizeSmall muiltr-new-17opruk" value="2026-07-18" data-gtm-form-interact-field-id="0">
```

Stable selector candidates:

```js
page.getByLabel("Start Date")
page.locator('input[name="created_at$gte"][type="date"]')
page.locator('[data-source="created_at$gte"] input[type="date"]')
```

Preferred selector:

```js
page.locator('[data-source="created_at$gte"] input[type="date"]').first()
```

Remove filter selector:

```js
page.locator('[data-source="created_at$gte"] button[title="Remove this filter"]').first()
```

### End Date Filter Field

Raw HTML before a value is filled:

```html
<div data-source="created_at$lte" class="filter-field RaFilterForm-filterFormInput muiltr-new-n6qaps">
  <button class="MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeSmall hide-filter RaFilterFormInput-hideButton muiltr-new-xfvph6" tabindex="0" type="button" data-key="created_at$lte" title="Remove this filter" fdprocessedid="p5hwdq">
    <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium muiltr-new-vubbuv" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="HighlightOffIcon">
      <path d="M14.59 8 12 10.59 9.41 8 8 9.41 10.59 12 8 14.59 9.41 16 12 13.41 14.59 16 16 14.59 13.41 12 16 9.41 14.59 8zM12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path>
    </svg>
    <span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span>
  </button>
  <div class="MuiFormControl-root MuiFormControl-fullWidth MuiTextField-root ra-input ra-input-created_at$lte muiltr-new-17j3rpk">
    <label class="MuiFormLabel-root MuiInputLabel-root MuiInputLabel-formControl MuiInputLabel-animated MuiInputLabel-shrink MuiInputLabel-sizeSmall MuiInputLabel-outlined MuiFormLabel-colorPrimary muiltr-new-1yt8nca" data-shrink="true" for="created_at$lte" id="created_at$lte-label"><span>End Date</span></label>
    <div class="MuiInputBase-root MuiOutlinedInput-root MuiInputBase-colorPrimary MuiInputBase-fullWidth MuiInputBase-formControl MuiInputBase-sizeSmall muiltr-new-chjfow">
      <input aria-invalid="false" aria-describedby="created_at$lte-helper-text" id="created_at$lte" name="created_at$lte" type="date" class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputSizeSmall muiltr-new-17opruk" value="">
      <fieldset aria-hidden="true" class="MuiOutlinedInput-notchedOutline muiltr-new-nqlg3w"><legend class="muiltr-new-14lo706"><span><span>End Date</span></span></legend></fieldset>
    </div>
    <p class="MuiFormHelperText-root MuiFormHelperText-sizeSmall MuiFormHelperText-contained muiltr-new-krn6c9" id="created_at$lte-helper-text"></p>
  </div>
  <div class="RaFilterFormInput-spacer">&nbsp;</div>
</div>
```

Raw HTML after value is filled:

```html
<div class="MuiFormControl-root MuiFormControl-fullWidth MuiTextField-root ra-input ra-input-created_at$lte muiltr-new-17j3rpk">
  <label class="MuiFormLabel-root MuiInputLabel-root MuiInputLabel-formControl MuiInputLabel-animated MuiInputLabel-shrink MuiInputLabel-sizeSmall MuiInputLabel-outlined MuiFormLabel-colorPrimary MuiFormLabel-filled muiltr-new-1yt8nca" data-shrink="true" for="created_at$lte" id="created_at$lte-label"><span>End Date</span></label>
  <div class="MuiInputBase-root MuiOutlinedInput-root MuiInputBase-colorPrimary MuiInputBase-fullWidth MuiInputBase-formControl MuiInputBase-sizeSmall muiltr-new-chjfow">
    <input aria-invalid="false" aria-describedby="created_at$lte-helper-text" id="created_at$lte" name="created_at$lte" type="date" class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputSizeSmall muiltr-new-17opruk" value="2026-07-19" data-gtm-form-interact-field-id="1">
    <fieldset aria-hidden="true" class="MuiOutlinedInput-notchedOutline muiltr-new-nqlg3w"><legend class="muiltr-new-14lo706"><span><span>End Date</span></span></legend></fieldset>
  </div>
  <p class="MuiFormHelperText-root MuiFormHelperText-sizeSmall MuiFormHelperText-contained MuiFormHelperText-filled muiltr-new-krn6c9" id="created_at$lte-helper-text"></p>
</div>
```

Stable selector candidates:

```js
page.getByLabel("End Date")
page.locator('input[name="created_at$lte"][type="date"]')
page.locator('[data-source="created_at$lte"] input[type="date"]')
```

Preferred selector:

```js
page.locator('[data-source="created_at$lte"] input[type="date"]').first()
```

Remove filter selector:

```js
page.locator('[data-source="created_at$lte"] button[title="Remove this filter"]').first()
```

### Date Filter Automation Notes

The date inputs are native browser date inputs:

```html
<input id="created_at$gte" name="created_at$gte" type="date" value="2026-07-18">
<input id="created_at$lte" name="created_at$lte" type="date" value="2026-07-19">
```

Do not automate the browser calendar popup. It is not normal DOM and does not need to be clicked.

Preferred date setting approach:

```js
async function setNativeDateInput(page, selector, value) {
  await page.locator(selector).first().evaluate((input, nextValue) => {
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
```

Example:

```js
await setNativeDateInput(page, '[data-source="created_at$gte"] input[type="date"]', "2026-07-18");
await setNativeDateInput(page, '[data-source="created_at$lte"] input[type="date"]', "2026-07-19");
```

Filter setup algorithm:

1. If `[data-source="created_at$gte"]` exists, set its input value directly.
2. If it does not exist, click `add filter`, select menu item `data-key="created_at$gte"`, then set the value.
3. If `[data-source="created_at$lte"]` exists, set its input value directly.
4. If it does not exist, click `add filter`, select menu item `data-key="created_at$lte"`, then set the value.
5. Verify both values using `input.value`.
6. Wait for the table to refresh.

Clear algorithm, only if needed:

1. Click `[data-source="created_at$gte"] button[title="Remove this filter"]` if present.
2. Click `[data-source="created_at$lte"] button[title="Remove this filter"]` if present.
3. Re-add and fill both filters.

Notes:

- The IDs `created_at$gte` and `created_at$lte` are useful, but the `$` makes CSS ID selectors awkward (`#created_at$gte` would need escaping).
- Attribute selectors are clean and safe: `[id="created_at$gte"]`, `[name="created_at$gte"]`, or `[data-source="created_at$gte"] input`.
- `data-source` on the wrapper is the best context because it also gives access to the remove button.

## Orders Pagination

The table defaults to 25 rows per page unless the browser/session has already remembered a different choice. The maximum visible option is 100.

Raw HTML when page size is already 100:

```html
<span class="MuiTablePagination-root muiltr-new-1u36y29">
  <div class="MuiToolbar-root MuiToolbar-gutters MuiToolbar-regular MuiTablePagination-toolbar muiltr-new-1mnp8a0">
    <div class="MuiTablePagination-spacer muiltr-new-1mrwq1p"></div>
    <p class="MuiTablePagination-selectLabel muiltr-new-1asdx7e" id=":r4q:">Rows per page:</p>
    <div class="MuiInputBase-root MuiInputBase-colorPrimary muiltr-new-su7bh8">
      <div tabindex="0" role="button" aria-expanded="false" aria-haspopup="listbox" aria-labelledby=":r4q: :r4p:" id=":r4p:" class="MuiSelect-select MuiTablePagination-select MuiSelect-standard MuiInputBase-input muiltr-new-14u03kk" fdprocessedid="9nvnd5">100</div>
      <input aria-hidden="true" tabindex="-1" class="MuiSelect-nativeInput muiltr-new-1k3x8v3" value="100">
      <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium MuiSelect-icon MuiTablePagination-selectIcon MuiSelect-iconStandard muiltr-new-ntyfco" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="ArrowDropDownIcon">
        <path d="M7 10l5 5 5-5z"></path>
      </svg>
    </div>
    <p class="MuiTablePagination-displayedRows muiltr-new-1asdx7e">1-25 of 25</p>
    <div class="MuiTablePagination-actions muiltr-new-13gz0fb"></div>
  </div>
</span>
```

Raw HTML for the page-size dropdown:

```html
<div class="MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation1 MuiPaper-root MuiMenu-paper MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation8 MuiPopover-paper muiltr-new-z92fow" tabindex="-1" style="opacity: 1; transform: none; min-width: 56px; transition: opacity 253ms cubic-bezier(0.4, 0, 0.2, 1), transform 168ms cubic-bezier(0.4, 0, 0.2, 1); top: 716px; left: 1097px; transform-origin: 28px 131.812px;">
  <ul class="MuiList-root MuiList-padding MuiMenu-list muiltr-new-r8u8y9" role="listbox" tabindex="-1" aria-labelledby=":r4q:">
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters MuiTablePagination-menuItem muiltr-new-12xo4ms" tabindex="-1" role="option" aria-selected="false" data-value="25">25<span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters MuiTablePagination-menuItem muiltr-new-12xo4ms" tabindex="-1" role="option" aria-selected="false" data-value="50">50<span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters Mui-selected MuiTablePagination-menuItem muiltr-new-12xo4ms" tabindex="0" role="option" aria-selected="true" data-value="100">100<span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></li>
  </ul>
</div>
```

Raw HTML when page size is 25:

```html
<div class="MuiInputBase-root MuiInputBase-colorPrimary muiltr-new-su7bh8">
  <div tabindex="0" role="button" aria-expanded="false" aria-haspopup="listbox" aria-labelledby=":r4q: :r4p:" id=":r4p:" class="MuiSelect-select MuiTablePagination-select MuiSelect-standard MuiInputBase-input muiltr-new-14u03kk" fdprocessedid="9nvnd5">25</div>
  <input aria-hidden="true" tabindex="-1" class="MuiSelect-nativeInput muiltr-new-1k3x8v3" value="25">
  <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium MuiSelect-icon MuiTablePagination-selectIcon MuiSelect-iconStandard muiltr-new-ntyfco" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="ArrowDropDownIcon">
    <path d="M7 10l5 5 5-5z"></path>
  </svg>
</div>
```

Stable selector candidates:

```js
page.locator(".MuiTablePagination-root").filter({ hasText: /Rows per page:/i })
page.locator('.MuiTablePagination-root [role="button"][aria-haspopup="listbox"]')
page.getByRole("option", { name: /^100$/ })
page.locator('[role="option"][data-value="100"]')
```

Preferred set-to-100 algorithm:

```js
async function ensureRowsPerPage100(page) {
  const pagination = page.locator(".MuiTablePagination-root").filter({ hasText: /Rows per page:/i }).first();
  const nativeInput = pagination.locator("input.MuiSelect-nativeInput").first();
  const currentValue = await nativeInput.inputValue().catch(() => "");
  if (currentValue === "100") return;

  await pagination.locator('[role="button"][aria-haspopup="listbox"]').first().click();
  await page.locator('[role="option"][data-value="100"]').first().click();
  await page.waitForFunction(() => {
    const input = document.querySelector(".MuiTablePagination-root input.MuiSelect-nativeInput");
    return input && input.value === "100";
  });
}
```

Verification:

```js
await expect(page.locator(".MuiTablePagination-root input.MuiSelect-nativeInput").first()).toHaveValue("100");
```

Notes:

- The visible selector control is a `div` with `role="button"` and `aria-haspopup="listbox"`.
- The actual value is mirrored in a hidden native input with `value="25"`, `value="50"`, or `value="100"`.
- Prefer clicking the visible MUI select and then the `role="option"` item. Do not set the hidden input directly.
- The displayed rows text can show `1-25 of 25` even when the selected page size is 100 if the filtered result only has 25 rows. Use the hidden input value to verify page size.

## Orders Table

Full table HTML was captured in:

```text
C:\Users\abdel\.codex\attachments\95a62711-b2e1-4837-a8f6-840ab38ab670\pasted-text.txt
```

Important raw structure:

```html
<div class="RaDatagrid-tableWrapper">
  <table class="MuiTable-root RaDatagrid-table muiltr-new-p3ka03">
    <thead class="MuiTableHead-root RaDatagrid-thead muiltr-new-18hmynj">
      <tr class="MuiTableRow-root MuiTableRow-head RaDatagrid-row RaDatagrid-headerRow muiltr-new-wkn2p8">
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-paddingCheckbox MuiTableCell-sizeSmall RaDatagrid-headerCell muiltr-new-1309f4t" scope="col">
          <span class="MuiButtonBase-root MuiCheckbox-root MuiCheckbox-colorPrimary PrivateSwitchBase-root MuiCheckbox-root MuiCheckbox-colorPrimary select-all muiltr-new-10phfyn" aria-label="Select all">
            <input class="PrivateSwitchBase-input muiltr-new-1m9pwf3" type="checkbox" data-indeterminate="false">
          </span>
        </th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-sizeSmall RaDatagrid-headerCell column-undefined muiltr-new-1eebo65" scope="col" resource="orders"><span> </span></th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-alignCenter MuiTableCell-sizeSmall RaDatagrid-headerCell column-short_id muiltr-new-121u8v" scope="col" resource="orders"><div class="muiltr-new-1bohsau">ID</div></th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-sizeSmall RaDatagrid-headerCell column-undefined muiltr-new-1eebo65" scope="col" resource="orders"><div class="muiltr-new-6y5c9t">Customer</div></th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-sizeSmall RaDatagrid-headerCell column-undefined muiltr-new-1eebo65" scope="col" resource="orders"><div class="muiltr-new-6y5c9t">Address</div></th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-alignCenter MuiTableCell-sizeSmall RaDatagrid-headerCell column-total_cost muiltr-new-121u8v" scope="col" resource="orders"><div class="muiltr-new-6y5c9t">Total Amount</div></th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-sizeSmall RaDatagrid-headerCell column-status muiltr-new-1eebo65" scope="col" resource="orders"><div class="muiltr-new-1bohsau">Order Status</div></th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-sizeSmall RaDatagrid-headerCell column-is_low_quality muiltr-new-1eebo65" scope="col" resource="orders"><span>Data Quality</span></th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-alignCenter MuiTableCell-sizeSmall RaDatagrid-headerCell column-ip_country muiltr-new-121u8v" scope="col" resource="orders"><span>IP Country</span></th>
        <th class="MuiTableCell-root MuiTableCell-head MuiTableCell-sizeSmall RaDatagrid-headerCell column-created_at muiltr-new-1eebo65" scope="col" resource="orders">
          <span class="MuiButtonBase-root MuiTableSortLabel-root Mui-active muiltr-new-105ucoo" tabindex="0" role="button" data-field="created_at" data-order="ASC" aria-label="Sort">Order Date</span>
        </th>
      </tr>
    </thead>
    <tbody class="MuiTableBody-root datagrid-body RaDatagrid-tbody muiltr-new-1xnox0e">
      <tr class="MuiTableRow-root MuiTableRow-hover RaDatagrid-row RaDatagrid-rowEven RaDatagrid-selectable RaDatagrid-clickableRow muiltr-new-wkn2p8">
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-paddingCheckbox MuiTableCell-sizeSmall muiltr-new-1d27vs">...</td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall column-undefined RaDatagrid-rowCell muiltr-new-1qddmjw">New</td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-alignCenter MuiTableCell-sizeSmall column-short_id RaDatagrid-rowCell muiltr-new-2m3qfi">3472</td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall column-undefined RaDatagrid-rowCell muiltr-new-1qddmjw">customer name<br>0502367728</td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall column-undefined RaDatagrid-rowCell muiltr-new-1qddmjw">address</td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-alignCenter MuiTableCell-sizeSmall column-total_cost RaDatagrid-rowCell muiltr-new-2m3qfi">298</td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall column-status RaDatagrid-rowCell muiltr-new-1qddmjw">Under Review</td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall column-is_low_quality RaDatagrid-rowCell muiltr-new-1qddmjw"></td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-alignCenter MuiTableCell-sizeSmall column-ip_country RaDatagrid-rowCell muiltr-new-2m3qfi">sa</td>
        <td class="MuiTableCell-root MuiTableCell-body MuiTableCell-sizeSmall column-created_at RaDatagrid-rowCell muiltr-new-1qddmjw">7/19/2026, 12:20:27 AM</td>
      </tr>
    </tbody>
  </table>
</div>
```

Stable table selectors:

```js
page.locator(".RaDatagrid-tableWrapper table.RaDatagrid-table").first()
page.locator("tbody.RaDatagrid-tbody tr.RaDatagrid-clickableRow")
row.locator(".column-short_id")
row.locator(".column-total_cost")
row.locator(".column-status")
row.locator(".column-is_low_quality")
row.locator(".column-ip_country")
row.locator(".column-created_at")
```

Customer and address caveat:

- The Customer and Address columns are `column-undefined` in this capture.
- Because they do not have stable field classes, parse them by header index.
- Customer cell text contains both name and phone separated by a line break.

Table row parsing strategy:

```js
const rowData = await row.evaluate((tr) => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const cells = Array.from(tr.querySelectorAll("td"));
  const cellText = (cell) => clean(cell && (cell.innerText || cell.textContent));

  const shortId = cellText(tr.querySelector(".column-short_id"));
  const totalAmount = cellText(tr.querySelector(".column-total_cost"));
  const status = cellText(tr.querySelector(".column-status"));
  const dataQuality = cellText(tr.querySelector(".column-is_low_quality"));
  const ipCountry = cellText(tr.querySelector(".column-ip_country"));
  const orderDate = cellText(tr.querySelector(".column-created_at"));

  const customerCell = cells[3];
  const customerLines = String(customerCell && customerCell.innerText || "")
    .split(/\n+/)
    .map((part) => clean(part))
    .filter(Boolean);

  return {
    shortId,
    customerName: customerLines[0] || "",
    phone: customerLines[1] || "",
    address: cellText(cells[4]),
    totalAmount,
    status,
    dataQuality,
    ipCountry,
    orderDate,
  };
});
```

Click strategy:

```js
await row.click();
await page.waitForFunction((shortId) => document.body.innerText.includes(`Order ID: #${shortId}`), rowData.shortId);
```

Notes:

- Use `short_id` as the table/detail navigation identity.
- Use date filter plus `orderDate` parsing as a safety check.
- Do not use row checkbox controls for this feature.
- Open rows one at a time; after detail processing, navigate back and re-find the row/page by `shortId` rather than reusing stale element handles.

## Real Order Detail Page

Example URL:

```text
https://app.easy-orders.net/#/orders/b7c804a2-80fe-4ae9-961a-0fb2aec74e74
```

### Detail Action Buttons

Header/status raw HTML:

```html
<div class="muiltr-new-gdzny0">
  <div class="muiltr-new-1821gv5">
    <h5 class="MuiTypography-root MuiTypography-h5 muiltr-new-1c4dqyq">Order ID: #3473</h5>
    <p class="MuiTypography-root MuiTypography-body2 muiltr-new-7wsbsx">Last action date is: Jul 19, 2026, 2:42 AM</p>
  </div>
  <div class="MuiButtonBase-root MuiChip-root MuiChip-filled MuiChip-sizeMedium MuiChip-colorDefault MuiChip-clickable MuiChip-clickableColorDefault MuiChip-filledDefault muiltr-new-28h8u2" tabindex="0" role="button" aria-haspopup="true" fdprocessedid="hix7kb">
    <span class="MuiChip-label MuiChip-labelMedium muiltr-new-9iedg7">
      <div aria-label="Edit order status" class="muiltr-new-8v90jo">
        <span>Under Review</span>
      </div>
    </span>
  </div>
  <button class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedPrimary MuiButton-sizeSmall MuiButton-outlinedSizeSmall muiltr-new-1trpaw8" tabindex="0" type="button" fdprocessedid="h3i9hr">Edit Order</button>
</div>
```

Header verification selectors:

```js
page.getByRole("heading", { name: /^Order ID:\s*#3473$/i })
page.locator("h5").filter({ hasText: /^Order ID:\s*#\d+$/ })
page.locator('[aria-label="Edit order status"]').filter({ hasText: /Under Review|Confirmed|Pending/i })
```

Opened-correct-order verification:

```js
async function verifyRealOrderHeader(page, shortId) {
  await page.locator("h5").filter({ hasText: new RegExp(`^Order ID:\\\\s*#${shortId}$`, "i") }).waitFor({ state: "visible" });
}
```

Resend button:

```html
<button class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedInherit MuiButton-sizeMedium MuiButton-outlinedSizeMedium MuiButton-colorInherit muiltr-new-b7fbuu" tabindex="0" type="button" fdprocessedid="1p6noa">Resend Order to Affiliates</button>
```

Edit button:

```html
<button class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedPrimary MuiButton-sizeSmall MuiButton-outlinedSizeSmall muiltr-new-1trpaw8" tabindex="0" type="button" fdprocessedid="aggt9">Edit Order</button>
```

Stable selectors:

```js
page.getByRole("button", { name: /^Resend Order to Affiliates$/i })
page.getByRole("button", { name: /^Edit Order$/i })
```

Success toast:

```html
<div class="MuiSnackbarContent-message css-1w0ym84">Order Sent</div>
```

Edit/save validation error toast example:

```html
<div class="MuiSnackbarContent-message css-1w0ym84">Key: 'UpdateOrderWithCartDto.Phone' Error:Field validation for 'Phone' failed on the 'min' tag</div>
```

Success verification:

```js
await page.locator(".MuiSnackbarContent-message", { hasText: /Order Sent/i }).first().waitFor({ state: "visible" });
```

Validation error detection:

```js
const message = await page.locator(".MuiSnackbarContent-message").last().innerText({ timeout: 5000 }).catch(() => "");
if (/validation|failed|error|UpdateOrderWithCartDto/i.test(message) && !/Order Sent/i.test(message)) {
  throw new Error(`EASY_ORDERS_EDIT_VALIDATION_FAILED: ${message}`);
}
```

Notes:

- Clicking resend is an external action. If clicked and success is unclear, mark the order `unverified`; do not click it again automatically.
- The success text observed is `Order Sent`.
- Edit/save validation errors also appear in `.MuiSnackbarContent-message`.
- Validation errors should be reported to the app error/Telegram reporting path with the EasyOrders order ID, account, field, and raw message.
- Example field error: `UpdateOrderWithCartDto.Phone` failed `min`, meaning the phone field was too short.

### Edit Modal Cart Items

Full cart item modal snippet captured in:

```text
C:\Users\abdel\.codex\attachments\937dec0f-8283-4d46-8496-108e16fd7223\pasted-text.txt
```

Important structure:

```html
<tr>
  <td width="60%">
    <a href="#/products/bbf53b2d-623e-42ae-a9a7-d0a0c58536ba"><img src="https://easyorders.fra1.digitaloceanspaces.com/1769107979441318685.jpg"></a>
    <p>2 حبه مكنسة كهربائية لاسلكية محمولة باليد 3*1 ببطارية 1200 مللي أمبير بضمان عام</p>
    <h6>Product SKU: SA050106WA0099</h6>
  </td>
  <td>
    <input id="cart_items[0].quantity" name="cart_items[0].quantity" type="number" step="1" min="1" value="1">
    <input id="cart_items[0].price" name="cart_items[0].price" type="number" step="any" min="0.01" value="62.5">
  </td>
  <td>62.50</td>
</tr>
```

Single-item selectors:

```js
page.locator('input[name="cart_items[0].quantity"]')
page.locator('input[name="cart_items[0].price"]')
```

All cart item field selectors:

```js
page.locator('input[name^="cart_items["][name$="].quantity"]')
page.locator('input[name^="cart_items["][name$="].price"]')
```

Modal item parsing:

```js
const items = await page.locator('input[name^="cart_items["][name$="].quantity"]').evaluateAll((qtyInputs) => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  return qtyInputs.map((qtyInput) => {
    const match = String(qtyInput.name || "").match(/^cart_items\[(\d+)\]\.quantity$/);
    const index = match ? match[1] : "";
    const priceInput = document.querySelector(`input[name="cart_items[${index}].price"]`);
    const row = qtyInput.closest("tr");
    const text = clean(row && (row.innerText || row.textContent));
    const skuMatch = text.match(/Product SKU:\s*([A-Z0-9_-]+)/i);
    return {
      index: Number(index),
      sku: skuMatch ? skuMatch[1] : "",
      quantity: qtyInput.value,
      price: priceInput ? priceInput.value : "",
      rowText: text,
    };
  });
});
```

Notes:

- The cart item names are index-based: `cart_items[0].quantity`, `cart_items[0].price`.
- For multi-item orders, expect `cart_items[1].quantity`, `cart_items[1].price`, etc.
- The row text includes `Product SKU: ...`, which gives a stable SKU verification point.
- Use the EasyOrders export as the expected value; use modal values as live UI verification before save/resend.

### Multi-Item Cart Pattern

Full multi-item snippet captured in:

```text
C:\Users\abdel\.codex\attachments\3523dcc3-99b3-436e-9bf8-140f6d6e886d\pasted-text.txt
```

Confirmed pattern:

```html
<tr>
  <td width="60%">
    <a href="#/products/a7748a73-7634-4336-9e6a-0f47f16fe26b">...</a>
    <p>منشار خشب ببطارية 2000 مللي...</p>
    <h6>Product SKU: SA050402MNSH99</h6>
  </td>
  <td>
    <input id="cart_items[0].quantity" name="cart_items[0].quantity" type="number" value="1">
    <input id="cart_items[0].price" name="cart_items[0].price" type="number" value="155">
  </td>
  <td>155</td>
</tr>
<tr>
  <td width="60%">
    <a href="#/products/4a0ef152-e876-4952-8cfb-a153a08539dd">...</a>
    <p>أقوى دريل الكفرات...</p>
    <h6>Product SKU: SA050101UP0199</h6>
  </td>
  <td>
    <input id="cart_items[1].quantity" name="cart_items[1].quantity" type="number" value="1">
    <input id="cart_items[1].price" name="cart_items[1].price" type="number" value="225">
  </td>
  <td>225</td>
</tr>
```

Implementation rule:

- Never hard-code only index `0`.
- Read all `input[name^="cart_items["][name$="].quantity"]`.
- Extract the index from the input name.
- Read matching `cart_items[index].price`.
- Parse `Product SKU:` from the same row when present.
- Fill only the row/index that differs from the expected export/catalog values.

### Edit Modal Order Summary

Raw structure:

```html
<h6>Order Summary</h6>
<tr><td>Payment Method</td><td>cod</td></tr>
<tr><td>Total Product Price</td><td>62.50</td></tr>
<tr><td>Shipping Cost</td><td><input id="shipping_cost" name="shipping_cost" type="number" step="1" min="0" value="28"></td></tr>
<tr><td>Total</td><td dir="auto">90.50</td></tr>
```

Shipping selector:

```js
page.locator('input[name="shipping_cost"]')
```

Notes:

- Shipping can be edited through `shipping_cost`, but current preference is to avoid editing shipping unless a rule explicitly requires it.
- Summary totals can be used as a sanity check after quantity/price edits.

### Edit Modal Customer Information

Full customer snippet captured in:

```text
C:\Users\abdel\.codex\attachments\f4c63ccb-457c-4e46-8da4-593b0c95b4b8\pasted-text.txt
```

Important fields:

```html
<input id="full_name" name="full_name" required type="text" value="عبدالله محمد احمد ">
<input id="email" name="email" type="email" value="">
<input id="phone" name="phone" required type="text" value="0537583140">
<input id="phone_alt" name="phone_alt" type="text" value="">
```

Stable selectors:

```js
page.locator('input[name="full_name"]')
page.locator('input[name="email"]')
page.locator('input[name="phone"]')
page.locator('input[name="phone_alt"]')
```

### Edit Modal Shipping Information

Important fields:

```html
<input id="country" name="country" type="text" value="">
<input id="government" name="government" type="text" value="منطقة مكة المكرمة">
<textarea id="address" name="address" required rows="3">جده الفيحاء شارع عين شمس </textarea>
```

Stable selectors:

```js
page.locator('input[name="country"]')
page.locator('input[name="government"]')
page.locator('textarea[name="address"]')
```

### Edit Modal Save And Cancel

Raw buttons:

```html
<button class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium muiltr-new-1iyesd0" tabindex="0" type="submit">Save</button>
<button class="MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeMedium MuiButton-textSizeMedium muiltr-new-fp2q21" tabindex="0" type="button">Cancel</button>
```

Stable selectors:

```js
page.getByRole("button", { name: /^Save$/i })
page.getByRole("button", { name: /^Cancel$/i })
```

Modal handling rule:

- If live values match expected values, click `Cancel`, then click `Resend Order to Affiliates`.
- If a high-confidence correction is needed, fill only the changed fields, click `Save`, wait for the modal to close or a success toast, then click `Resend Order to Affiliates`.
- If correction is low-confidence, cancel and mark the order for manual review.

### Real Orders List Pagination

Raw page 2 button:

```html
<button class="MuiButtonBase-root MuiPaginationItem-root MuiPaginationItem-sizeSmall MuiPaginationItem-text MuiPaginationItem-circular MuiPaginationItem-page muiltr-new-veft6f" tabindex="0" type="button" aria-label="Go to page 2">2</button>
```

Raw selected page 2 button:

```html
<button class="MuiButtonBase-root MuiPaginationItem-root MuiPaginationItem-sizeSmall MuiPaginationItem-text MuiPaginationItem-circular Mui-selected MuiPaginationItem-page muiltr-new-veft6f" tabindex="0" type="button" aria-label="page 2" aria-current="true">2</button>
```

Stable selectors:

```js
page.getByRole("button", { name: /^Go to page 2$/i })
page.locator('button[aria-current="true"][aria-label="page 2"]')
page.getByRole("button", { name: /^Next$/i })
```

Notes:

- Set rows per page to 100 first.
- Pagination is still needed for large ranges.
- After clicking a page, verify `aria-current="true"` on the target page or wait for displayed rows text/table first row to change.

## Missed Orders Page

URL:

```text
https://app.easy-orders.net/#/missed-orders
```

### Missed Orders Add Filter Button

Raw HTML:

```html
<div class="muiltr-new-1baulvz">
  <button class="MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeSmall MuiButton-textSizeSmall add-filter muiltr-new-ewqyyo" tabindex="0" type="button" aria-label="add filter" aria-haspopup="true" fdprocessedid="wxtj9h">
    <span class="MuiButton-startIcon MuiButton-iconSizeSmall muiltr-new-16rzsu1">...</span>
    add filter
    <span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span>
  </button>
</div>
```

Stable selector:

```js
page.getByRole("button", { name: /add filter/i })
```

Fallback selector:

```js
page.locator('button[aria-label="add filter"], button.add-filter:has-text("add filter")').first()
```

### Missed Orders Filter Menu

Raw HTML:

```html
<div class="MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation1 MuiPaper-root MuiMenu-paper MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation8 MuiPopover-paper muiltr-new-z92fow" tabindex="-1">
  <ul class="MuiList-root MuiList-padding MuiMenu-list muiltr-new-r8u8y9" role="menu" tabindex="-1">
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="full_name"><span>Full Name</span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="phone"><span>Phone Number</span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="created_at$gte"><span>Start Date</span></li>
    <li class="MuiButtonBase-root MuiMenuItem-root MuiMenuItem-gutters new-filter-item muiltr-new-v1nvuh" tabindex="-1" role="menuitem" data-key="created_at$lte"><span>End Date</span></li>
  </ul>
</div>
```

Stable selectors:

```js
page.locator('[role="menuitem"][data-key="created_at$gte"]').first()
page.locator('[role="menuitem"][data-key="created_at$lte"]').first()
page.locator('[role="menuitem"][data-key="phone"]').first()
```

Notes:

- Missed Orders has fewer filters than real Orders.
- It still has the same `created_at$gte` and `created_at$lte` date filters.
- Phone filter exists, but the recovery flow still needs whole-table discovery because there is no export-provided missed-order UUID.

### Missed Orders Date Filter Form

Raw HTML:

```html
<form class="muiltr-new-49cuoc" style="padding: 0px 20px; margin-bottom: 20px;">
  <div data-source="created_at$gte" class="filter-field RaFilterForm-filterFormInput muiltr-new-n6qaps">
    <button class="MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeSmall hide-filter RaFilterFormInput-hideButton muiltr-new-xfvph6" tabindex="0" type="button" data-key="created_at$gte" title="Remove this filter" fdprocessedid="a00t35">...</button>
    <div class="MuiFormControl-root MuiFormControl-fullWidth MuiTextField-root ra-input ra-input-created_at$gte muiltr-new-17j3rpk">
      <label for="created_at$gte" id="created_at$gte-label"><span>Start Date</span></label>
      <input aria-invalid="false" aria-describedby="created_at$gte-helper-text" id="created_at$gte" name="created_at$gte" type="date" value="">
    </div>
  </div>
  <div data-source="created_at$lte" class="filter-field RaFilterForm-filterFormInput muiltr-new-n6qaps">
    <button class="MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeSmall hide-filter RaFilterFormInput-hideButton muiltr-new-xfvph6" tabindex="0" type="button" data-key="created_at$lte" title="Remove this filter" fdprocessedid="irxuj">...</button>
    <div class="MuiFormControl-root MuiFormControl-fullWidth MuiTextField-root ra-input ra-input-created_at$lte muiltr-new-17j3rpk">
      <label for="created_at$lte" id="created_at$lte-label"><span>End Date</span></label>
      <input aria-invalid="false" aria-describedby="created_at$lte-helper-text" id="created_at$lte" name="created_at$lte" type="date" value="">
    </div>
  </div>
</form>
```

Raw filled Start Date:

```html
<input aria-invalid="false" aria-describedby="created_at$gte-helper-text" id="created_at$gte" name="created_at$gte" type="date" class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputSizeSmall muiltr-new-17opruk" value="2026-07-18" data-gtm-form-interact-field-id="1">
```

Raw filled End Date:

```html
<input aria-invalid="false" aria-describedby="created_at$lte-helper-text" id="created_at$lte" name="created_at$lte" type="date" class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputSizeSmall muiltr-new-17opruk" value="2026-07-19" data-gtm-form-interact-field-id="2">
```

Shared date selectors:

```js
page.locator('[data-source="created_at$gte"] input[type="date"]').first()
page.locator('[data-source="created_at$lte"] input[type="date"]').first()
```

Shared remove selectors:

```js
page.locator('[data-source="created_at$gte"] button[title="Remove this filter"]').first()
page.locator('[data-source="created_at$lte"] button[title="Remove this filter"]').first()
```

Notes:

- The same date-filter helper used for real Orders should work on Missed Orders.
- Do not automate the native date picker popup; set `input.value` and dispatch `input` + `change`.

### Missed Orders Pagination

Raw pagination with 11 rows:

```html
<div class="MuiToolbar-root MuiToolbar-gutters MuiToolbar-regular MuiTablePagination-toolbar muiltr-new-1mnp8a0">
  <p class="MuiTablePagination-selectLabel muiltr-new-1asdx7e" id=":r4r:">Rows per page:</p>
  <div class="MuiInputBase-root MuiInputBase-colorPrimary muiltr-new-su7bh8">
    <div tabindex="0" role="button" aria-expanded="false" aria-haspopup="listbox" aria-labelledby=":r4r: :r4q:" id=":r4q:" class="MuiSelect-select MuiTablePagination-select MuiSelect-standard MuiInputBase-input muiltr-new-14u03kk" fdprocessedid="6epj2s">25</div>
    <input aria-hidden="true" tabindex="-1" class="MuiSelect-nativeInput muiltr-new-1k3x8v3" value="25">
  </div>
  <p class="MuiTablePagination-displayedRows muiltr-new-1asdx7e">1-11 of 11</p>
  <div class="MuiTablePagination-actions muiltr-new-13gz0fb"></div>
</div>
```

Raw pagination with multiple pages:

```html
<div class="MuiToolbar-root MuiToolbar-gutters MuiToolbar-regular MuiTablePagination-toolbar muiltr-new-1mnp8a0">
  <p class="MuiTablePagination-selectLabel muiltr-new-1asdx7e" id=":r4r:">Rows per page:</p>
  <div class="MuiInputBase-root MuiInputBase-colorPrimary muiltr-new-su7bh8">
    <div tabindex="0" role="button" aria-expanded="false" aria-haspopup="listbox" aria-labelledby=":r4r: :r4q:" id=":r4q:" class="MuiSelect-select MuiTablePagination-select MuiSelect-standard MuiInputBase-input muiltr-new-14u03kk" fdprocessedid="6epj2s">25</div>
    <input aria-hidden="true" tabindex="-1" class="MuiSelect-nativeInput muiltr-new-1k3x8v3" value="25">
  </div>
  <p class="MuiTablePagination-displayedRows muiltr-new-1asdx7e">1-25 of 62</p>
  <div class="MuiTablePagination-actions muiltr-new-13gz0fb">
    <nav aria-label="pagination navigation">
      <button disabled aria-label="Go to previous page">...</button>
      <button aria-current="true" aria-label="page 1">1</button>
      <button aria-label="Go to page 2">2</button>
      <button aria-label="Go to page 3">3</button>
      <button aria-label="Next">...</button>
    </nav>
  </div>
</div>
```

Raw active page 2:

```html
<button class="MuiButtonBase-root MuiPaginationItem-root MuiPaginationItem-sizeSmall MuiPaginationItem-text MuiPaginationItem-circular Mui-selected MuiPaginationItem-page muiltr-new-veft6f" tabindex="0" type="button" aria-label="page 2" fdprocessedid="jw56cn" aria-current="true">2</button>
```

Selectors:

```js
page.locator(".MuiTablePagination-root, .MuiTablePagination-toolbar").filter({ hasText: /Rows per page:/i })
page.locator(".MuiTablePagination-root input.MuiSelect-nativeInput, .MuiTablePagination-toolbar input.MuiSelect-nativeInput")
page.getByRole("button", { name: /^Go to page 2$/i })
page.getByRole("button", { name: /^Next$/i })
page.locator('button[aria-current="true"][aria-label="page 2"]')
```

Notes:

- Same pagination approach as real Orders.
- Set rows per page to 100 first.
- For ranges above 100 rows, advance pages with `Next` or explicit `Go to page N` buttons.
- Verify active page with `aria-current="true"` and the selected page label.

### Missed Orders Table

Full table HTML captured in:

```text
C:\Users\abdel\.codex\attachments\46314f17-be0c-46e7-9b44-6a549b1ac32b\pasted-text.txt
```

Important structure:

```html
<div class="RaDatagrid-tableWrapper">
  <table class="MuiTable-root RaDatagrid-table muiltr-new-p3ka03">
    <thead>
      <tr>
        <th scope="col"><span aria-label="Select all">...</span></th>
        <th class="RaDatagrid-headerCell column-undefined" resource="missed-orders"><span>Status</span></th>
        <th class="RaDatagrid-headerCell column-full_name" resource="missed-orders"><span data-field="full_name">Full Name</span></th>
        <th class="RaDatagrid-headerCell column-phone" resource="missed-orders"><span data-field="phone">Phone Number</span></th>
        <th class="RaDatagrid-headerCell column-created_at" resource="missed-orders"><span data-field="created_at">Order Date</span></th>
      </tr>
    </thead>
    <tbody class="MuiTableBody-root datagrid-body RaDatagrid-tbody muiltr-new-1xnox0e">
      <tr class="MuiTableRow-root MuiTableRow-hover RaDatagrid-row RaDatagrid-rowEven RaDatagrid-selectable RaDatagrid-clickableRow muiltr-new-wkn2p8">
        <td>checkbox</td>
        <td class="column-undefined">Under Review</td>
        <td class="column-full_name">ساره الشريف</td>
        <td class="column-phone">0545618781</td>
        <td class="column-created_at">7/18/2026, 10:29:45 PM</td>
      </tr>
    </tbody>
  </table>
</div>
```

Stable selectors:

```js
page.locator(".RaDatagrid-tableWrapper table.RaDatagrid-table").first()
page.locator("tbody.RaDatagrid-tbody tr.RaDatagrid-clickableRow")
row.locator(".column-full_name")
row.locator(".column-phone")
row.locator(".column-created_at")
```

Status caveat:

- Status is `column-undefined`, but it is the first data column after the checkbox.
- Parse status from `cells[1]`.
- Observed values include `Under Review` and `Completed`.
- Completed missed orders should normally be skipped because they have already been converted/processed.

Row parsing strategy:

```js
const rowData = await row.evaluate((tr) => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const cells = Array.from(tr.querySelectorAll("td"));
  const cellText = (cell) => clean(cell && (cell.innerText || cell.textContent));
  return {
    status: cellText(cells[1]),
    fullName: cellText(tr.querySelector(".column-full_name")),
    phone: cellText(tr.querySelector(".column-phone")),
    orderDate: cellText(tr.querySelector(".column-created_at")),
  };
});
```

Click/open strategy:

```js
await row.click();
await page.waitForLoadState("domcontentloaded").catch(() => {});
const detailUrl = page.url();
```

Notes:

- Missed rows do not expose a short numeric ID in the table.
- Capture `detailUrl` after clicking; it may contain an internal UUID that can be reused for retries.
- If a stable detail URL exists after row click, store it in memory for retry.
- Phones may appear in Arabic-Indic digits; reuse existing phone normalization before matching or reporting.

## Missed Order Detail Page

Example detail URL after clicking a missed-order row:

```text
https://app.easy-orders.net/#/missed-orders/71b778cf-3226-4afc-a89b-ceba62025b42
```

Example row that opens the detail page:

```html
<tr class="MuiTableRow-root MuiTableRow-hover RaDatagrid-row RaDatagrid-rowEven RaDatagrid-selectable RaDatagrid-clickableRow muiltr-new-wkn2p8">
  <td>checkbox</td>
  <td class="column-undefined">Under Review</td>
  <td class="column-full_name">أحمد محمد علي</td>
  <td class="column-phone">0501234567</td>
  <td class="column-created_at">7/15/2026, 7:57:42 PM</td>
</tr>
```

### Missed Detail Action Buttons

Edit button:

```html
<button class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedPrimary MuiButton-sizeSmall MuiButton-outlinedSizeSmall muiltr-new-1trpaw8" tabindex="0" type="button" fdprocessedid="79c8t">Edit<span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></button>
```

Convert button:

```html
<button class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium muiltr-new-1iyesd0" tabindex="0" type="button" fdprocessedid="kvv2lr">Convert to Order<span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></button>
```

Completed status chip:

```html
<div class="MuiChip-root MuiChip-filled MuiChip-sizeMedium MuiChip-colorSuccess MuiChip-filledSuccess muiltr-new-1xkpllr">
  <span class="MuiChip-label MuiChip-labelMedium muiltr-new-9iedg7">Completed</span>
</div>
```

Stable selectors:

```js
page.getByRole("button", { name: /^Edit$/i })
page.getByRole("button", { name: /^Convert to Order$/i })
page.locator(".MuiChip-root").filter({ hasText: /^Completed$/i })
```

Notes:

- Under Review missed orders can show `Convert to Order`.
- Completed missed orders do not show the convert button and should be skipped.
- Store the missed detail URL after row click; it can probably be reused for retry.

### Missed Edit Modal Cart Items

Full cart item snippet captured in:

```text
C:\Users\abdel\.codex\attachments\5c090259-c0a9-406d-a342-28d64d514ac2\pasted-text.txt
```

Important structure:

```html
<div class="MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation1 MuiCard-root muiltr-new-2odz5n">
  <h6>Cart Items</h6>
  <button type="button">Choose Products</button>
  <table>
    <tbody>
      <tr>
        <td width="60%">
          <a href="#/products/7f9ca30d-3272-4463-b4f2-f4b9d2baf056">
            <img src="https://media.taager.com/73045a97-62ec-45ee-950d-1aa802a2fade.jpg">
          </a>
          <p>مفتاح ربط حوض متعدد الوظائف 8 في 1</p>
        </td>
        <td width="fit-content">
          <input id="cart_items[0].quantity" name="cart_items[0].quantity" type="number" step="1" min="1" value="1">
          <input id="cart_items[0].price" name="cart_items[0].price" type="number" step="any" min="0.01" value="115">
        </td>
        <td width="fit-content">115</td>
      </tr>
    </tbody>
  </table>
</div>
```

Stable selectors:

```js
page.locator('input[name^="cart_items["][name$="].quantity"]')
page.locator('input[name^="cart_items["][name$="].price"]')
page.getByRole("button", { name: /^Choose Products$/i })
```

Modal item parsing:

```js
const items = await page.locator('input[name^="cart_items["][name$="].quantity"]').evaluateAll((qtyInputs) => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  return qtyInputs.map((qtyInput) => {
    const match = String(qtyInput.name || "").match(/^cart_items\[(\d+)\]\.quantity$/);
    const index = match ? match[1] : "";
    const priceInput = document.querySelector(`input[name="cart_items[${index}].price"]`);
    const row = qtyInput.closest("tr");
    const productLink = row && row.querySelector('a[href*="#/products/"]');
    const productHref = productLink ? productLink.getAttribute("href") || "" : "";
    const text = clean(row && (row.innerText || row.textContent));
    return {
      index: Number(index),
      productHref,
      productName: text
        .replace(/\bQuantity\b|\bPrice\b|Choose Products/gi, "")
        .replace(/\d+(?:\.\d+)?\s*$/, "")
        .trim(),
      quantity: qtyInput.value,
      price: priceInput ? priceInput.value : "",
      rowText: text,
    };
  });
});
```

Notes:

- Unlike the real-order modal sample, this missed-order sample does not show `Product SKU: ...`.
- Use product name/catalog matching and Taager SKU defaults to resolve SKU.
- The product link contains a product UUID, but not a visible SKU in this snippet.
- If future samples reveal a SKU in missed detail, prefer that.

### Missed Edit Modal Order Details

Full order details snippet captured in:

```text
C:\Users\abdel\.codex\attachments\3e952dcb-f190-4f1f-92b8-810c72216bf3\pasted-text.txt
```

Important fields:

```html
<h6>Order Details</h6>
<input id="full_name" name="full_name" rows="1" type="text" value="أحمد محمد علي">
<input id="email" name="email" rows="1" type="text" value="">
<input id="phone" name="phone" rows="1" type="text" value="0501234567">
<input id="country" name="country" rows="1" type="text" value="">
<input id="government" name="government" rows="1" type="text" value="المنطقة الشرقية">
<textarea id="address" name="address" rows="2">حي الروضة، شارع الأمير محمد بن فهد، بالقرب من مسجد الحي، شقة 12</textarea>
<textarea id="note" name="note" rows="2"></textarea>
<tr><td>Reason</td><td>Customer phone number exceeded the daily order limit</td></tr>
```

Stable selectors:

```js
page.locator('input[name="full_name"]')
page.locator('input[name="email"]')
page.locator('input[name="phone"]')
page.locator('input[name="country"]')
page.locator('input[name="government"]')
page.locator('textarea[name="address"]')
page.locator('textarea[name="note"]')
```

Reason extraction:

```js
const reason = await page.locator("tr").filter({ hasText: /^Reason/i }).first().innerText().catch(() => "");
```

### Missed Edit Modal Save And Cancel

Raw buttons:

```html
<button class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium muiltr-new-1iyesd0" tabindex="0" type="submit" fdprocessedid="03x61o">Save<span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></button>
<button class="MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeMedium MuiButton-textSizeMedium muiltr-new-fp2q21" tabindex="0" type="button" fdprocessedid="fmucnv">Cancel<span class="MuiTouchRipple-root muiltr-new-w0pj6f"></span></button>
```

Stable selectors:

```js
page.getByRole("button", { name: /^Save$/i })
page.getByRole("button", { name: /^Cancel$/i })
```

Missed handling rule:

- If status is `Completed`, skip.
- If status is `Under Review`, open detail and inspect/edit.
- If high-confidence corrections are needed, edit once, save, then click `Convert to Order`.
- If no edit is needed, click `Cancel` if modal was opened only for verification, then click `Convert to Order`.
- Retry pass should not edit again; it should only reopen the stored detail URL and click `Convert to Order` once more.

## Taager Failed Orders Diagnosis

URL:

```text
https://taager.com/sa/orders/legacy#failed-orders
```

Purpose:

- Use only after the normal Taager verification and retry flow.
- Helps explain orders that EasyOrders accepted (`Order Sent` / converted) but did not appear as successful Taager orders.
- Does not replace the normal Taager orders export verification.

Example failed-orders workbook inspected:

```text
H:\marketing\tageer\new\خرباانه\19-7\failed-orders-taager.xlsx
```

Sheet:

```text
الطلبات
```

Headers:

```text
اسم المستلم
المبلغ الإجمالي
ربح الطلب
العنوان
الدولة
تاريخ الإنشاء
رقم الهاتف
المحافظة
كود سبب الفشل
المنتجات في الطلب
المنتجات
الكميات
الأسعار
الطلب المستلم بواسطة
كود الطلب للمتجر
```

Useful fields:

```text
رقم الهاتف            -> phone
كود سبب الفشل        -> failure code
المنتجات              -> SKU list
الكميات               -> quantity list
الأسعار               -> price list
كود الطلب للمتجر      -> store order code, includes EasyOrders UUID in samples
الطلب المستلم بواسطة  -> source, observed easyorders_plugin
```

Observed failure codes:

```text
price_low_error
product_stock_not_available
invalid_phone_number
product_not_available
```

Example rows:

```json
{
  "رقم الهاتف": "0537583140",
  "كود سبب الفشل": "price_low_error",
  "المنتجات": "SA050106WA0099",
  "الكميات": "1",
  "الأسعار": "63",
  "كود الطلب للمتجر": "1944783_b7c804a2-80fe-4ae9-961a-0fb2aec74e74"
}
```

```json
{
  "رقم الهاتف": "5055619463",
  "كود سبب الفشل": "product_stock_not_available",
  "المنتجات": "SA050301XFJ499",
  "الكميات": "44",
  "الأسعار": "7700",
  "كود الطلب للمتجر": "1944783_4e5072bd-b4e7-4182-810d-5365a79d30e2"
}
```

Diagnosis flow:

1. Initial Taager export.
2. Process real and missed EasyOrders candidates.
3. Taager verification export.
4. Retry still-missing orders once.
5. Final Taager verification export.
6. Download Taager failed-orders export for the selected/widened range.
7. Match final still-missing attempted orders against failed orders by:
   - EasyOrders UUID in `كود الطلب للمتجر`, when available
   - normalized phone + SKU
   - created date proximity, if needed
8. Split final report into:
   - verified in Taager orders
   - found in Taager failed orders, with failure code
   - not found in Taager orders or failed orders, needs manual check

Notes:

- For real orders, `كود الطلب للمتجر` appears to include the EasyOrders UUID, so matching can be strong.
- For missed orders, store the missed detail UUID after row click; check whether Taager failed `كود الطلب للمتجر` includes the same UUID after convert.
- This lets the results page show a better reason than generic `could not be processed`.
- Still do not infer hidden causes when no failed-order row exists; report `not_found_after_retry`.
