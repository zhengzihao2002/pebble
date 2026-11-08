# Card resizing

AppShell observes loaded cards and animates intrinsic height changes over
260ms. It changes layout height, so text stays crisp and the following content
moves with the card. There is no transform scaling or fixed final height.

- New cards establish a baseline without an entrance resize.
- Further content changes retarget from the currently visible height.
- The observer pauses for its own animation to avoid resize feedback.
- Nested cards follow their containing card; dialogs keep their existing motion.
- Sections with existing height transitions keep their own motion.
- Reports filters opt out with `data-pb-resize="off"`. On desktop the grid
  reserves a real column for the inspector. The final responsive layout is
  calculated once; live report cards then move/resize from their visible old
  rectangles to the final rectangles over 360ms with a gentler ease-in/out, matching the filter surface.
  Closing shares its 60ms content-fade delay; interrupted motion reverses immediately. No card overlaps the inspector.
- `useReportInspectorLayout` captures an interrupted animation before cancelling
  it and commits the next layout atomically, so rapid reversals continue from
  the current visible positions. Cards and filter surface share one animation
  clock; controls reveal on its completion signal. During motion the filter
  surface stays clickable, allowing an immediate reversal from its visible size. The shared card height
  animator pauses during this managed motion. Layout caching waits
  until the live transforms settle. Charts resize once at the final layout;
  their viewport clips any pending Recharts resize before paint.
- When the Reports summary switches between columns and a stacked layout,
  supporting details dissolve for 70ms before committing the new arrangement.
  The eyebrow, Net label and amount remain visible; sampled counter-transforms
  preserve their screen position and text size while the card reshapes.
  Supporting figures, charts and filter contents then return together on a
  shared 80ms fade after geometry settles. Changes that keep the same column arrangement do not dissolve content.
- A second toggle during the short exit cancels the queued change. Later
  reversals continue from the visible geometry, and explicit Find/open intent
  remains queued correctly. Resize, backgrounding and Reduced Motion cancel
  pending exits and clear their decoration without reviving stale callbacks.
- The filter surface unfolds down and left from its top-right corner. Its
  fixed-width controls fade in once the surface fits, and out before it
  contracts. The collapsed rail uses the same card surface and glow.
- Desktop filter controls retain their final scroll viewport while hidden,
  avoiding temporary scrollbars during opening/closing. Actual overflow stays
  scrollable in short windows. Local sections and the mobile outer accordion
  use 200ms grid transitions. No page snapshot covers live controls.
- Viewport changes, hidden pages and Reduced Motion settle immediately.
- Layout caching waits for settled geometry. Pagehide settles synchronously
  before saving so an intermediate height cannot become a loading placeholder.

Dashboard's This period header groups its title and date on desktop. On narrow
screens, controls stay above the changing date note so that note cannot move
the arrow hit targets. The period selector has a stable width; arrow buttons
sit above the transparent native picker and use functional state updates for
queued steps. Months, quarters and years use the same bounded navigation.

The app retains its original typography and native system cursors. Text size
still has a 100% minimum; the rejected Small preset remains removed.
