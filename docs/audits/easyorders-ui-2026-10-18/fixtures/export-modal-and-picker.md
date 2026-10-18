# Sanitized live IAB structure notes

Source: root task's direct observation of the current authenticated IAB on both export routes. Not a reconstructed outerHTML fixture; exact raw HTML is pending.

```text
dialog[role=dialog][aria-modal=true][name="Export Orders"]
  input[readonly][type=text]
    aria-label="Select date range to filter statistics"
    placeholder="Select date range to filter statistics"
    value=[two selected dates; exact date omitted]
  button[role=button][name="Export"][class contains MuiButton-contained]
  [when range picker is open]
    .rdp-root.rdp[data-mode=range][data-required=true][data-multiple-months=true]
      .rdp-month (two visible month sections)
      button.rdp-button_previous[aria-label="Go to the Previous Month"]
      button.rdp-button_next[aria-label="Go to the Next Month"]
      td[data-day=YYYY-MM-DD] > button.rdp-day_button
      td.rdp-range_start[data-day=YYYY-MM-DD]
      td.rdp-range_end[data-day=YYYY-MM-DD]
      .rdp-footer > button[role=button][name="Apply"]
```

Observed behavior: Apply on the already-selected range closed the picker and retained the displayed range. No date endpoints were changed and the modal Export button was not clicked. Modal Escape did not dismiss the dialog in this observation.
