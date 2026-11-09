# Optional cursors

The soft cursor setting uses native CSS cursors. Text fields and editable
content use a rounded vertical bar; other elements keep the soft arrow.
Both follow the light/dark theme and the existing Small, Default and Large
size presets. Turning the setting off restores the browser's own cursors.

Text cursor SVGs have a transparent 32×36 view box with the bar centered at
(16,18). Each size's hotspot scales from that center so clicks keep the same
location. The light-mode bar is dark gray, and the dark-mode bar is light gray.
