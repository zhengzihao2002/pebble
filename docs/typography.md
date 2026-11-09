# Text size and readability

Settings offers Default (100%), Large (115%) and Extra large (130%), plus a
100–150% slider and number field. `normalizeTextSize` applies the same bounds
to setters, restored local preferences and live typography. The initial HTML
script also clamps old smaller preferences before paint, preventing a reload
from briefly showing smaller text.

Rounded's Latin font (Nunito) is preloaded with the root layout. It must be
discovered before the persistent sidebar paints, rather than waiting for its
text to request the font. Otherwise refresh can visibly swap the sidebar from
a fallback face even though the saved text size stays unchanged.

The original page typography is preserved. The 100% minimum does not enlarge
individual labels or chart text; it only prevents scaling the app below its
normal size.
