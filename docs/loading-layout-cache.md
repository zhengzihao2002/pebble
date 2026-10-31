# Remembered loading layouts

The browser records the loaded page's card rectangles and reuses them as pulsing
skeleton contours on later visits. It stores numbers and small shape enums only:
no text, HTML, amounts, transaction/account IDs, or financial records are read.
The current server-authenticated user ID scopes the localStorage key.

Profiles separate each page, exact content/viewport width and viewport height,
text size, language and font choices. A new device size or unmatched profile uses
the ordinary page-specific skeleton. Entries expire after 30 days; each user's
cache retains at most 48 profiles and 80 rectangles per profile. Invalid or
unavailable storage is an optional cache miss, never a page-loading failure.

Navigation previews, streamed route fallbacks and browser-only initialization use
the same cache surface. A small self-contained inline restore runs in streamed
HTML before React downloads; hydration keeps this DOM surface unmanaged and
uses the same numeric validation. Full-width bars retain their negative inset
and the page retains its trailing space. Version 2 replaces the older clipped
geometry; each page needs one completed visit to record a fresh profile.

The last visible skeleton remains over the incoming content until mount effects,
fonts and marked child fetches settle. Content then fades in over 300 ms without
moving the contours. Initial card rise-ins are disabled for that handoff. Reduced
motion removes the fade. Fresh data can still change the natural layout; cached
geometry never forces financial content into stale dimensions.

Loaded content is observed for card and viewport resizes, animation completion,
font completion and DOM changes. Only loaded, visible pages at their initial scroll position are
recorded, avoiding the displaced coordinates of pinned/sticky cards. Navigation
also captures the outgoing page before it is hidden. Sign-out clears the active
user's cache and prevents pagehide from recreating it. Dimensions never constrain
the loaded page itself; newly loaded data replaces the estimate and updates it.

`node --test tests/layoutCache.test.cjs` checks profile isolation, validation,
expiry, user separation, content-free capture and sign-out cleanup. Browser
fixtures render the real app clients with synthetic props and stubbed actions.
They compare every visible card's bounds on repeat visits and each reveal frame
on desktop and mobile, and delay React JavaScript to verify pre-hydration refresh
restoration. All verification is isolated from Neon.
Bump the cache version/prefix when changing this geometry format.
