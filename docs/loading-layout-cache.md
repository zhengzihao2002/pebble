# Remembered loading layouts

Settings > Appearance > Page loading offers **Cached cards** (the default)
or **Traditional spinner**, a large centered circle with Loading underneath.
The per-user device preference also applies to initial streamed fallbacks and
client initialization. It is restored before paint, so spinner mode never
flashes cached contours. Spinner mode skips restoring cached geometry; recording
loaded layouts continues so returning to Cached cards can reuse them. Both
styles stay visible through the handoff until incoming content is ready, and
respect reduced motion.
Inside the app shell, one spinner stays mounted from the navigation preview
through streamed fallbacks and the final fade. Replacing those page segments
does not replace or clone the ring, so its linear rotation never restarts.

The browser records the loaded page's card rectangles and reuses them as pulsing
skeleton contours on later visits. It stores numbers and small shape enums only:
no text, HTML, amounts, transaction/account IDs, or financial records are read.
The current server-authenticated user ID scopes the localStorage key:
`pebble-layout-sizes:v2:<userId>`. Both capture and pre-hydration restoration
read that identity from the server-rendered `pebble-session` metadata. They
never fall back to the last user's preferences or another user's cache. This
is per signed-in person, rather than per bank account within that person's app.

Profiles separate each page, exact content/viewport width, text size, language
and font choices. Desktop profiles also require the same viewport height for
height-dependent pane layouts. Phone profiles (viewport width below 760px) reuse
their flowing card geometry across height changes from browser chrome, the
keyboard or a full app relaunch. Existing v2 entries with an exact phone height
remain readable; the most recently saved compatible layout wins, and a new
capture consolidates those height variants. A new width or unmatched profile uses
the ordinary page-specific skeleton. Entries expire after 30 days; each user's
cache retains at most 48 profiles and 80 rectangles per profile. Invalid or
unavailable storage is an optional cache miss, never a page-loading failure.

Navigation previews, streamed route fallbacks and browser-only initialization use
the same cache surface. A small self-contained inline restore runs in streamed
HTML before React downloads; hydration keeps this DOM surface unmanaged and
uses the same numeric validation. The chooser runs before the estimate's HTML;
CSS enables that estimate only after a confirmed cache miss. A hidden or detached
streamed segment waits for AppShell's measurable main column, then restores via a
temporary observer before paint. It never interprets a zero-width staging
container as a cache miss. Full-width bars retain their negative inset
and the page retains its trailing space. Version 2 replaces the older clipped
geometry; each page needs one completed visit to record a fresh profile.

The last visible skeleton remains over the incoming content until mount effects,
fonts and marked child fetches settle. Content then fades in over 300 ms without
moving the contours. Initial card rise-ins are disabled for that handoff. Reduced
motion removes the fade. Fresh data can still change the natural layout; cached
geometry never forces financial content into stale dimensions.

Loaded content is observed for card and viewport resizes, animation completion,
font completion and DOM changes. Entering the background also flushes a capture
synchronously on `visibilitychange`, since iOS may terminate an app without a
`pagehide` event. Only loaded, visible pages at their initial scroll position are
recorded, avoiding the displaced coordinates of pinned/sticky cards. Desktop
Transactions is recorded only while both panes are at their initial scroll
positions, and clips its contours to the pane viewports. Offscreen statement
rows cannot turn its skeleton into a full-page-height card. The separate pane
shadow layer stores no additional content or data.
Transactions keeps the same outer scrollbar gutter during its fallback and
loaded states, so both use the same profile width. Its inline restore measures
the rendered header before hydration to stabilize the pane height. The default
estimate follows the summary/search/statement columns without the loaded
frame's negative margins, keeping the handoff from applying its top offset twice.
Navigation also captures the outgoing page before it is hidden. Sign-out retains each
user's geometry and pauses departing-page captures so late pagehide, resize or
animation events cannot overwrite it. Returning to that account restores the
same layouts in the fresh document; other users read only their own entries.
Offline financial pages and reference-data snapshots still clear on sign-out.
Dimensions never constrain the loaded page itself; newly loaded data replaces
the estimate and updates it.

`node --test tests/layoutCache.test.cjs tests/loadingRoutes.test.mjs` checks
profile isolation, validation, expiry, user separation, content-free capture and
explicit cache clearing. `tests/signOutLayoutCache.test.cjs` also checks the
real sign-out flow's geometry retention, late-capture freeze, user switching
and fresh-sign-in restoration. The route tests render the actual Reports,
Analysis and Transactions fallbacks and execute their cache bootstrap against
a saved layout, including Transactions' header calibration before hydration.

Browser fixtures render the real app clients with synthetic props and stubbed
actions, and import each route's actual loading.tsx. They compare card bounds and
record every paint through route loading and client initialization under 3G on
desktop and mobile. Income fixtures render all four Analysis income tiles, and
assert each one's matching cached rectangle. Analysis's standalone metric tiles
share the capture/resize selector; tiles inside an outer card are not duplicated.

Split-stream checks delay React JavaScript and pause just before the inline
bootstrap to reject any default-skeleton frame on a cached visit. Staged-segment
tests also cover attachment and zero-width layout. All verification is isolated
from Neon. Bump the cache version/prefix when changing this geometry format.

Cold-start verification closes Chromium completely, then opens the same on-disk
profile in a new process with a different phone viewport height. The actual
Dashboard route bootstrap must restore the saved rectangles before hydration
without painting the default skeleton. No React module or tab memory survives
that test; only localStorage does. Width/user isolation and spinner mode remain
covered separately.

The mobile bottom navigation also keeps numeric height and selected-tab geometry
in `pebble-bottom-nav:v1:<userId>`. Its inline bootstrap restores those dimensions
before hydration for the same route, width, typography, language and bottom
safe-area padding. Height changes at app launch do not invalidate it. Entries
expire after 30 days and are limited to 32 profiles. Only a closed bar at the
committed destination is recorded; Add/More state and personal text are never
stored. Hydration releases the temporary minimum height, so live font, orientation
and accessibility changes retain their natural layout. Invalid/unavailable
storage falls back to the ordinary server-rendered navigation.
