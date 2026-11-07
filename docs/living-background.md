# Living background

Settings → Appearance → Living background is optional and off by default. Its
`ambientBackground` preference is stored per user on this device. Old preferences
from the removed fluid background do not enable this version.

Three large circles of light start from the selected theme's `--pine` colour;
two blend in a restrained amount of its existing `--gold` accent. Their broad
radial falloff and 26px blur keep edges soft while leaving a visible pool of
light. Explicit equal width and height keep every circle at 1:1. Diameters are
100%, 88% and 112% of the viewport's longer side, with no fixed desktop cap:
on a 390×844 phone they are about 844/743/945px; on a 1440×900 desktop they are
1440/1267/1613px, and they continue scaling on large monitors. Light mode uses
a gentler tint; dark mode has a more visible local core. Each circle shifts
between neighbouring hues, up to 42 degrees either side of its starting colour,
over an independent 43/57/71-second cycle. This creates visible colour changes
while deriving the palette from the selected theme.
The theme's paper, existing background and card surfaces are preserved; the
scene never paints a separate base colour or a full-screen colour wash.

Independent horizontal and vertical motion carries the centres between opposite
viewport edges. The three horizontal periods are 31/43/53 seconds; the vertical
periods are 47/59/71 seconds. Smooth easing and staggered phases prevent the
circles from moving together or retracing the previous small triangular paths.
Their enlarged footprints sweep the corners and interior over time, including
exposed margins, the sidebar and card gutters.

One pointer-inert, screen-fixed layer belongs to AppShell and survives route
changes. CSS animates translation and the blur/hue filter, with no WebGL context,
pointer tracking, JavaScript frame loop or financial data. Backgrounding pauses its
animations; Reduced Motion displays the static composition. Disabling removes
the layer and its visibility listener.

Preference regression tests cover default-off behavior, the rejected preference,
fresh-runtime persistence and user isolation. Browser fixtures render real
dashboard cards with synthetic props and verify motion, retained DOM identity,
pause/resume, Reduced Motion, unchanged card geometry/colours and mobile layout.
Visual review checks populated desktop/mobile views at multiple points in each
path and in light/dark themes, so the result is assessed in the actual spaces
around cards rather than only on an empty background. Actual browser geometry
was sampled every half-second for two minutes on ten viewports from 390×844 to
3840×2160, including tablets, ultrawide and portrait monitors. Every viewport point falls within a circle's
visible radial footprint during that window: a 31×21 grid plus the remaining
radius clearance covers the gaps between samples. Overlap peaks were also
reviewed visually to check that the larger circles retain the theme's identity.
Additional browser checks confirm circular geometry, screen-proportional sizing
and changes in rendered pixel colours with position held still. Production Neon
is never used for validation.
