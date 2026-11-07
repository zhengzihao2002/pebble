# Text size and readability

Settings offers Default (100%), Large (115%) and Extra large (130%), plus a
100–150% slider and number field. `normalizeTextSize` applies the same bounds
to setters, restored local preferences and live typography. The initial HTML
script also clamps old smaller preferences before paint, preventing a reload
from briefly showing smaller text.

The original page typography is preserved. The 100% minimum does not enlarge
individual labels or chart text; it only prevents scaling the app below its
normal size.
