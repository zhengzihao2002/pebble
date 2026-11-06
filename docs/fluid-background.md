# Fluid background

Settings → Appearance → Fluid background is off by default. The boolean is
persisted in the existing per-user UI preferences, with no database access.

AppShell owns a single WebGL canvas that survives route changes. Five circular
Gaussian glows follow independent sine/cosine paths with different periods and
slowly blend the selected theme's primary and accent colours. Their broad paths
spread colour across the screen instead of focusing it at a few corners. The
palette uses the current `--pine`, `--gold`, `--wine` and `--paper` values, including
theme and appearance changes. Colour brightness is bounded and the layer blends
gently with the existing surface so page labels remain legible in light mode.

The layer ignores pointer events, overscans by 84 CSS pixels on every side and
uses CSS blur(26px). The framebuffer's longest edge is at most 700 pixels,
independent of device pixel ratio. Rendering is throttled to at most 24fps;
slower devices may draw fewer frames. No pointer tracking or financial data is
involved. Hidden pages stop their animation loop, and Reduced Motion renders a
still frame. Disabling the option unmounts the canvas and releases GPU resources
and event listeners. Unsupported or lost WebGL uses a static theme-coloured
fallback; a restored context recreates its resources.

`node --test tests/fluidBackground.test.cjs` verifies bounded rendering, pause,
resume, context recovery, Reduced Motion and resource cleanup using a fake GL
context. A real Chromium WebGL fixture also checks default-off/persisted settings,
canvas identity through navigation, theme uniform changes, mobile resizing,
blur/overscan, hidden-page behavior and disabling. All data and actions used for
validation are synthetic; production Neon is never involved.
