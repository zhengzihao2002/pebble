# Living background

Settings → Appearance → Living background is optional and off by default. Its
`ambientBackground` preference is stored per user on this device. Old preferences
from the removed fluid background do not enable this version.

Three localized circles of light use only the selected theme's `--pine` colour.
Their broad radial falloff and 26px blur keep edges soft while leaving a visible
pool of light. Different sizes and independent 34/43/53-second transform paths
move through exposed margins, the sidebar and card gutters. Light mode uses a
gentler tint; dark mode has a more visible local core. The theme's paper, existing
background and card surfaces are preserved. The scene never paints a separate
base colour or adds unrelated accent hues.

One pointer-inert, screen-fixed layer belongs to AppShell and survives route
changes. CSS animates transforms only, with no WebGL context, pointer tracking,
JavaScript frame loop or financial data. Backgrounding the page pauses its
animations; Reduced Motion displays the static composition. Disabling removes
the layer and its visibility listener.

Preference regression tests cover default-off behavior, the rejected preference,
fresh-runtime persistence and user isolation. Browser fixtures render real
dashboard cards with synthetic props and verify motion, retained DOM identity,
pause/resume, Reduced Motion, unchanged card geometry/colours and mobile layout.
Visual review checks populated desktop/mobile views at multiple points in each
path and in light/dark themes, so the result is assessed in the actual spaces
around cards rather than only on an empty background. Production Neon is never
used for validation.
