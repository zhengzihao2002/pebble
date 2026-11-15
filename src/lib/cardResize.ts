const CARDS = '.card, [data-slot="card"], .pb-hero, .pb-accounts-tile, .pb-accounts-cc, .pb-settings-tile, .add-goal-tile, .stat-tab';
const EXCLUDED = '[role="dialog"], .pb-modal-overlay, [aria-busy="true"], [data-pb-resize="off"], .pb-navigation-preview, .pb-page-skeleton, .pb-cached-layout';
const ANIMATION_ID = 'pb-card-resize';
const DURATION = 260;
const LANGUAGE_DURATION = 420;
const LAYOUT_PROPERTIES = ['height', 'minHeight', 'maxHeight', 'blockSize', 'gridTemplateRows', 'flexBasis'];

interface CardState {
  element: HTMLElement;
  width: number;
  height: number;
  animation: Animation | null;
  languageChange: boolean;
}

/** Settle before saving a page's geometry, or when the page becomes hidden. */
export function settleCardResizes(scope: ParentNode) {
  for (const card of scope.querySelectorAll<HTMLElement>('.pb-card-resizing')) {
    for (const animation of card.getAnimations()) {
      if (animation.id === ANIMATION_ID) animation.cancel();
    }
    card.classList.remove('pb-card-resizing');
  }
}

/** Animate actual layout height, preserving crisp text and stable hit targets.
 * No wrappers, initial entrance animation, fixed final heights or scale transforms. */
export function observeCardResizes(root: HTMLElement) {
  if (typeof ResizeObserver === 'undefined' || typeof root.animate !== 'function') return () => {};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const states = new Map<HTMLElement, CardState>();
  let disposed = false;
  let languageHeights: Map<HTMLElement, number> | null = null;
  const observe = (card: HTMLElement) => {
    // Nested cards join the language batch, but ordinary resize observation
    // stays on outer cards so a parent animation cannot feed back into a child.
    if (!card.parentElement?.closest(CARDS)) resize.observe(card);
  };
  const beforeLanguage = () => {
    if (reduced.matches || document.hidden) return;
    languageHeights = new Map([...states.values()].filter(state => state.element.isConnected && !state.element.closest(EXCLUDED))
      .map(state => [state.element, state.element.offsetHeight]));
    settleCardResizes(root);
  };

  const resize = new ResizeObserver(entries => {
    for (const entry of entries) {
      const state = states.get(entry.target as HTMLElement);
      if (state && !state.animation && !languageHeights) update(state);
    }
  });

  function update(state: CardState, from = state.height, languageChange = false, measured?: { width: number; height: number }) {
    const card = state.element;
    const width = measured?.width ?? card.offsetWidth, height = measured?.height ?? card.offsetHeight;
    const previousWidth = state.width;
    state.width = width; state.height = height;
    if (disposed || !card.isConnected || reduced.matches || document.hidden || card.closest(EXCLUDED)
      || !card.getClientRects().length || !width || !height || !from
      || (!languageChange && (card.parentElement?.closest(CARDS) || Math.abs(width - previousWidth) > 1)) || Math.abs(height - from) < 2) return;
    // Existing expanding sections already move the surrounding layout smoothly.
    // Let those transitions finish instead of adding another lagging animation.
    const alreadyResizing = card.getAnimations({ subtree: true }).some(animation =>
      animation.id !== ANIMATION_ID && animation.playState === 'running'
      && (animation.effect as KeyframeEffect | null)?.getKeyframes().some(frame => LAYOUT_PROPERTIES.some(property => property in frame)),
    );
    if (alreadyResizing) return;

    // Unobserve our own animated height to prevent ResizeObserver feedback.
    resize.unobserve(card);
    card.classList.add('pb-card-resizing');
    const animation = card.animate(
      [{ height: `${from}px` }, { height: `${height}px` }],
      { duration: languageChange ? LANGUAGE_DURATION : DURATION, easing: languageChange ? 'cubic-bezier(.4,0,.2,1)' : 'cubic-bezier(.22,.78,.22,1)' },
    );
    animation.id = ANIMATION_ID;
    state.animation = animation; state.languageChange = languageChange;
    animation.onfinish = () => {
      if (disposed || state.animation !== animation) return;
      state.animation = null; state.languageChange = false;
      card.classList.remove('pb-card-resizing');
      if (!card.isConnected || !states.has(card)) return;
      // Content may have changed while resizing. The final height remains auto.
      update(state);
      if (!state.animation) observe(card);
    };
    animation.oncancel = () => {
      if (disposed || state.animation !== animation) return;
      state.animation = null; state.languageChange = false;
      card.classList.remove('pb-card-resizing');
      if (!card.isConnected || !states.has(card)) return;
      state.width = card.offsetWidth; state.height = card.offsetHeight;
      observe(card);
    };
  }

  function register(card: HTMLElement) {
    if (states.has(card) || card.closest(EXCLUDED)) return;
    states.set(card, { element: card, width: card.offsetWidth, height: card.offsetHeight, animation: null, languageChange: false });
    observe(card);
  }
  function discover(node: Node) {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(CARDS)) register(node);
    node.querySelectorAll<HTMLElement>(CARDS).forEach(register);
  }
  root.querySelectorAll<HTMLElement>(CARDS).forEach(register);
  const mutation = new MutationObserver(records => {
    // Locale subscribers can commit separately. Never consume the snapshot
    // on an incidental mutation before translated content has committed.
    if (languageHeights) return;
    for (const [card, state] of states) {
      if (!card.isConnected) {
        states.delete(card); resize.unobserve(card); state.animation?.cancel();
      } else if (state.animation && !state.languageChange && records.some(record => card.contains(record.target))) {
        // A rapid update continues from the visible height, not an old target.
        const currentHeight = card.offsetHeight;
        state.animation.onfinish = null; state.animation.oncancel = null;
        state.animation.cancel(); state.animation = null;
        card.classList.remove('pb-card-resizing');
        update(state, currentHeight);
        if (!state.animation) observe(card);
      }
    }
    for (const record of records) {
      if (record.type === 'attributes') discover(record.target);
      record.addedNodes.forEach(discover);
    }
  });
  const afterLanguage = () => {
    const language = languageHeights; languageHeights = null;
    // Translation can change both wrapping and width without a viewport resize.
    // Animate from the pre-language height instead of dropping the transition.
    if (language) {
      // Read every natural endpoint before animating any card. In stretched
      // grid rows, the first card's animated height otherwise becomes the
      // second card's target, creating an endless shrinking feedback loop.
      const targets = [...language].flatMap(([card, from]) => {
        const state = states.get(card);
        return state ? [{ state, from, width: card.offsetWidth, height: card.offsetHeight }] : [];
      });
      for (const { state, from, width, height } of targets) update(state, from, true, { width, height });
    }
  };
  mutation.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-busy'] });
  const settle = () => { languageHeights = null; settleCardResizes(root); };
  window.addEventListener('pebble:before-language-change', beforeLanguage);
  window.addEventListener('pebble:after-language-change', afterLanguage);
  const visibility = () => { if (document.hidden) settle(); };
  window.addEventListener('resize', settle, { passive: true });
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', settle);
  return () => {
    disposed = true;
    mutation.disconnect(); resize.disconnect();
    settle(); states.clear();
    window.removeEventListener('pebble:before-language-change', beforeLanguage);
    window.removeEventListener('pebble:after-language-change', afterLanguage);
    window.removeEventListener('resize', settle);
    document.removeEventListener('visibilitychange', visibility);
    reduced.removeEventListener('change', settle);
  };
}
