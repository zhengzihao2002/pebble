# Text size and readability

Settings offers Default (100%), Large (115%) and Extra large (130%), plus a
100–150% slider and number field. `normalizeTextSize` applies the same bounds
to setters, restored local preferences and live typography. The initial HTML
script also clamps old smaller preferences before paint, preventing a reload
from briefly showing smaller text.

Small UI text uses shared, font-relative roles:

| Role | At 100% | Token |
| --- | --- | --- |
| Key metric/field label | 14px | `--pb-text-sm` |
| Supporting text, hint, legend | 13px | `--pb-text-xs` |
| Dense chart/calendar annotation | 12px | `--pb-text-chart` |

These are relative sizes, so all grow with the preference. Display amounts and
headings retain their hierarchy; fractional currency digits remain relative
to the amount. Charts use font-relative tick labels and automatically measured
Y-axis widths. Mobile fields retain a 16px minimum to prevent Safari zoom while
also growing at larger text settings.

Reports keeps one money-in/out/net row per metric on narrow cards, with 18px
amounts. Those labels use the same 14px role as other key labels, rather than
their former 11.5px size.

Validate with English and Chinese, narrow phones through desktop, at 100%,
115%, 130% and 150%. Check full currency amounts, wrapping, chart tick bounds,
font controls and the background customization panel. Tests use synthetic
fixtures and local preferences; no production financial records are needed.
