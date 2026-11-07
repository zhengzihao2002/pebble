# Card glow

Card glow is a local Appearance preference, on by default. Its muted color
comes from the current theme's pine and supporting ink colors. Two soft
falloffs add gentle separation while preserving the app's ordinary depth
shadows. Glow strength decreases automatically with the living background on.

The decoration has no box of its own (`display: contents`). Per-card SVGs live
outside card clipping containers, on the app's actual scrolling surface. Native
CSS anchors follow cards where supported, including sticky surfaces. Older
browsers use content-space positions for flow cards and omit sticky/fixed
surfaces rather than chasing them with JavaScript. No root scroll listener,
viewport paint canvas, CSS blur surface or colored outset box-shadow is used.

The rounded card interior is masked out, so the effect does not tint text or
amounts through transparent card fills. Each filter has 88px of space beyond
the card: almost five times its widest 18px Gaussian deviation. Its output
reaches zero alpha before that filter region ends. Parent card/grid boundaries
cannot trim that tail; the physical viewport remains the normal screen edge.

Geometry updates on resize and page changes, with a short update loop only
while a card or ancestor is already animating. Hidden pages pause work. Layers
ignore pointer events and are hidden from accessibility APIs. Removing or
disabling the effect restores anchor names and removes all owned SVGs.

Validation uses synthetic pages: pixel checks for unclipped tails and masked
interiors, immediate flow scrolling with JavaScript doing no scroll work,
native sticky-anchor layout, theme/live-background combinations, preference
persistence, dynamic card sizes and effect teardown. Production Neon is not
needed to test this visual feature.
