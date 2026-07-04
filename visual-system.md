# Taager Visual System

The renderer uses one presentation contract across English/Arabic and dark/light themes. Visual changes must not alter IDs, data attributes, event wiring, calculations, data-dependent colors, geometry, or the application zoom presets.

## Typography

- UI Latin: Inter.
- UI Arabic: IBM Plex Sans Arabic, with Inter as the Latin fallback for mixed strings.
- Numeric data: Inter with tabular lining numerals.
- Technical IDs, SKUs, code, and logs: DM Mono.
- Brand display text: Syne; Arabic display text uses IBM Plex Sans Arabic.
- Supported weights: 400, 500, 600, 700, and exceptional 800.
- Supported sizes: 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, and 48px.
- Meaningful text must never be smaller than 10px.

The source of truth is `src/renderer/styles/typography.css`. Generated markup should use its variables or role classes. Runtime values such as colors, chart coordinates, progress dimensions, and animation state may remain inline.

## Presentation tokens

- Spacing follows a 4px grid through `--space-1` to `--space-10`.
- Radius roles are `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`, and `--radius-pill`.
- Motion roles are `--motion-micro`, `--motion-standard`, and `--motion-entrance`.
- Existing semantic surface, text, accent, success, warning, danger, and chart tokens remain authoritative for themes.

## Safety and verification

- Do not add universal or `[style]` override rules.
- Prefer source-level changes to generated inline typography.
- Keep all six zoom presets and their controls.
- Run `npm run audit:typography`, `npm run verify:visual-system`, `npm run check:syntax`, and the existing responsive/theme/zoom QA after presentation changes.
