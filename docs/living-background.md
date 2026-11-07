# Living background

Settings → Appearance → Living background is optional and off by default. Its
`ambientBackground` preference is stored per user on this device. Old preferences
from the removed fluid background do not enable this version.

Default uses three large circles from the selected theme's primary colour; two blend
in its existing accent. Diameters are 100%, 88% and 112% of the viewport's longer
side. Positions and radius use CSS screen coordinates independently of the
framebuffer, so circles stay 1:1 on phones, desktops and large monitors. Hues
shift up to 42 degrees over independent 43/57/71-second cycles. Light mode has a
gentler tint and dark mode a more visible core. The shader paints transparent
Gaussian pools with a smooth outer falloff, preserving paper and card surfaces.

`ambientMotion.ts` is the shared route definition for the live renderer and
Settings preview. Independent X periods of 31/43/53 seconds and Y periods of
47/59/71 seconds, smooth easing and staggered phases sweep the whole background
over time. No permanent corner or interior band is excluded.

The customization studio offers Default, Orbit, Weave and Sweep routes, speed
from 0.25× to 3×, frost from 0–100%, and one to six balls. Frost 50%, speed 1×,
three theme-coloured balls and the Default route reproduce the previous look.
At zero frost, circles use the shorter viewport dimension so each remains a
distinct, screen-scaled circle. Their size blends into the existing large
Gaussian wash as frost reaches its default 50%; the default look is unchanged.
Orbit follows loops, Weave crosses in figure eights, and Sweep visits the four
corners along opposing diagonals. Each route covers the screen over time even
with one ball. Additional balls have distinct phases and periods; their combined
strength is balanced to keep a six-ball scene from simply becoming brighter.

Each ball can use its automatic theme colour or a custom hex colour. Automatic
colours retain their gentle hue cycle; custom colours stay as chosen. Controls
apply live without recreating the canvas or resetting its clock. Restore defaults
resets the appearance without changing the enabled switch. Settings are validated
and saved per user in localStorage; existing saved preferences receive the current
look. Invalid routes, non-finite numbers and invalid colours fall back safely.

One pointer-inert, fixed canvas belongs to AppShell and persists across route
changes. The transparent WebGL framebuffer is capped at 700px on its longer
side, independent of device pixel ratio, and draws at no more than 24fps. A
bounded Canvas 2D fallback uses the same paths, colours and Gaussian envelope.
Softness is rendered into the image: there are no screen-sized blurred DOM
sprites or animated CSS filters. Hidden pages stop drawing and freeze elapsed
time. Reduced Motion uses a static composition while still updating for resize
and settled theme changes. Context restoration rebuilds resources without
resetting the scene clock. Disabling cleans up observers, listeners, frame
callbacks and renderer resources.

The enabled background uses a lighter 40% paper tint in the frosted top bar,
letting the moving light remain visible. Blur stays on the header pseudo-element
so fixed action menus remain viewport-relative. Background-off, unsupported-blur
and theme-transition fallback treatments retain their existing behavior.

The compact Settings route preview shows clear circles and recent trails at
8× the selected speed, using the same route, count and colours. It preserves the actual viewport's aspect in
a fixed-height stage. Play/pause is independent of the background switch; the
preview pauses offscreen or hidden and requires explicit Play with Reduced
Motion. English and Chinese text explain the preview.

Card glow is an independent setting, on by default. It adds a muted theme-colored
halo to the original card depth shadows and automatically reduces its strength
when the living background is on. See [card-glow.md](card-glow.md) for its
scrolling, clipping and transparent-tail guarantees.

The main scrollbar is restored to the app's original native treatment.
Native system cursors preserve the platform's regular pointer, clickable hand,
text selection, drag, resize, disabled and loading states. No cursor images or
custom cursor styles are shipped.

Validation uses synthetic data and local fixtures only. Pure tests cover
preference persistence/defaults, shared easing, framebuffer limits, colour
rotation and full-screen coverage over two minutes on ten viewport shapes,
including a grid-clearance proof between sampled points. Browser checks exercise
the actual WebGL component and forced 2D fallback at DPR 3: frame cap, shader
output, persistent canvas, hidden/reduced pause, settled palette, resize through
4K and portrait, visible light through the header, fixed menus, context recovery
and complete disable/cleanup. Separate preview checks cover clear circles,
independent controls, 8× motion, aspect ratio, all route/count/colour choices,
native picker theme seeding, hidden/offscreen pause and Reduced Motion opt-in.
Defaults also match the previous renderer across 60 synthetic frames: the 2D
fallback is pixel-identical and WebGL differs by at most 1/255. Production Neon
is never used for validation.
