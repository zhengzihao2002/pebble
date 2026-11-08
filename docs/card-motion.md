# Card resizing

AppShell observes loaded cards and animates intrinsic height changes over
260ms. It changes layout height, so text stays crisp and the following content
moves with the card. There is no transform scaling or fixed final height.

- New cards establish a baseline without an entrance resize.
- Further content changes retarget from the currently visible height.
- The observer pauses for its own animation to avoid resize feedback.
- Nested cards follow their containing card; dialogs keep their existing motion.
- Sections with existing height transitions keep their own motion.
- Reports filters opt out with `data-pb-resize="off"`. On desktop the report
  keeps a fixed width while one glowing filter surface unfolds down and left
  from its fixed top-right corner (180ms). Closing reverses that direction.
  Fixed-width controls fade in after the surface fits and fade out before it
  contracts. The collapsed rail uses that same card surface and glow.
- Desktop filter controls retain their final scroll viewport while hidden,
  avoiding temporary scrollbars during opening/closing. The actual overflow
  remains scrollable in short windows. Local sections and the mobile outer
  accordion use 200ms grid transitions. No page snapshot covers live controls.
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
