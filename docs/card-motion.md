# Card resizing

AppShell observes loaded cards and animates intrinsic height changes over
260ms. It changes layout height, so text stays crisp and the following content
moves with the card. There is no transform scaling or fixed final height.

- New cards establish a baseline without an entrance resize.
- Further content changes retarget from the currently visible height.
- The observer pauses for its own animation to avoid resize feedback.
- Nested cards follow their containing card; dialogs keep their existing motion.
- Sections with existing height transitions keep their own motion.
- Reports filters opt out with `data-pb-resize="off"`. A single physical grid
  track changes the filter column and report width together over 360ms. The
  report/filter heights interpolate in normal flow, moving the following rows.
  Cards and text are never transformed or counter-scaled. Native border radii,
  font sizes and the top-left origin therefore stay steady.
- Before committing a reversal, the hook captures the currently visible grid
  columns and card heights. All replacement animations share one timeline.
  The shared generic height effect pauses, and layout caching waits for motion.
- Only a change between stacked and side-by-side summary arrangements triggers
  the brief supporting-content exit. Width changes within the same arrangement
  keep every summary region visible. Details and filter contents return on the
  shared 80ms reveal after geometry settles.
- The moving filter remains clickable, with explicit Find/open intent retained.
  Resize, backgrounding and Reduced Motion cancel pending exits and stale work.
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

Filter height and readiness use unscaled layout measurements, including while
the filter shell is transformed. Screen-space rectangles must not be saved as
layout heights; doing so can leave controls permanently hidden after opening.
