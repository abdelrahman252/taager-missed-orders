# Sanitized live IAB structure notes

Initial summary; superseded by the sanitized structure in `account-settings-popover.html`.

- Trigger: button with accessible name `User settings`; Base UI/Tailwind classes, not MUI.
- Trigger state: `aria-haspopup="dialog"`, `aria-expanded="true"`.
- Popup: `div[role="dialog"][data-slot="popover-content"]`.
- Popup visible text order was reported as `[ACCOUNT] ● [EMAIL]: [ACTIVE STORE] [ACCOUNT] Add Store Update your info Add New Account Sign Out`.
- All identity fields are replaced with placeholders here. No account or store action was clicked.

The exact sanitized structure later confirmed adjacent active-store/email paragraphs. No store action was clicked.
