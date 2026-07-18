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
