# Remembered loading layouts

The browser records the loaded page's card rectangles and reuses them as pulsing
skeleton contours on later visits. It stores numbers and small shape enums only:
no text, HTML, amounts, transaction/account IDs, or financial records are read.
The current server-authenticated user ID scopes the localStorage key:
`pebble-layout-sizes:v2:<userId>`. Both capture and pre-hydration restoration
read that identity from the server-rendered `pebble-session` metadata. They
never fall back to the last user's preferences or another user's cache. This
is per signed-in person, rather than per bank account within that person's app.

Profiles separate each page, exact content/viewport width and viewport height,
text size, language and font choices. A new device size or unmatched profile uses
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
font completion and DOM changes. Only loaded, visible pages at their initial scroll position are
recorded, avoiding the displaced coordinates of pinned/sticky cards. Desktop
Transactions is recorded only while both panes are at their initial scroll
positions, and clips its contours to the pane viewports. Offscreen statement
rows cannot turn its skeleton into a full-page-height card. The separate left
shadow layer stores no additional content or data.
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
and fresh-sign-in restoration. The route tests render the actual Reports and
Analysis fallbacks and execute their cache bootstrap against a saved layout.

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
