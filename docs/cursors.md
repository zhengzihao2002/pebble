# Optional cursors

The soft cursor setting uses native CSS cursors. Text fields and editable
content use a rounded vertical bar; other elements keep the soft arrow.
Both follow the light/dark theme and the existing Small, Default and Large
size presets. Turning the setting off restores the browser's own cursors.

The released text bar is longer. While the mouse button is held on an editable
field, native `:active` shortens the bar slightly (32 units versus 36 when
released, about 10% including the rounded caps). Releasing restores the long
bar. No pointer tracking or animation loop is used.

The short cursor has a transparent 32×36 view box centered at (16,18); the
long cursor has a 32×48 view box centered at (16,24). Both hotspots scale with
the chosen size so shrinking stays centered on the click point. Light mode
uses a dark gray bar and dark mode uses a light gray bar.
