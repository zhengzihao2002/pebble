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

Loaded content is observed for card and viewport resizes, font completion and
DOM changes. Only loaded, visible pages at their initial scroll position are
recorded, avoiding the displaced coordinates of pinned/sticky cards. Navigation
also captures the outgoing page before it is hidden. Sign-out clears the active
user's cache and prevents pagehide from recreating it. Dimensions never constrain
the loaded page itself; newly loaded data replaces the estimate and updates it.

`node --test tests/layoutCache.test.cjs` checks profile isolation, validation,
expiry, user separation, content-free capture and sign-out cleanup. Browser
fixtures verify repeat navigation, card resizes, refresh persistence, responsive
fallbacks, mobile geometry, hydration and reduced motion without a database.
Bump the cache version/prefix when changing this geometry format.
