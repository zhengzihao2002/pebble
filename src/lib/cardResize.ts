const CARDS = '.card, [data-slot="card"], .pb-hero, .pb-accounts-tile, .pb-accounts-cc, .pb-settings-tile, .add-goal-tile, .stat-tab';
const EXCLUDED = '[role="dialog"], .pb-modal-overlay, [aria-busy="true"], [data-pb-resize="off"], .pb-navigation-preview, .pb-page-skeleton, .pb-cached-layout';
const ANIMATION_ID = 'pb-card-resize';
const RESET_ATTRIBUTE = 'data-pb-resize-reset';
const DURATION = 260;
const LANGUAGE_DURATION = 420;
const PERIOD_DURATION = 300;
const PERIOD_EASING = 'cubic-bezier(.4,0,.2,1)';
const PERIOD_FADE = 'pb-period-fade';
const PERIOD_EDGE_BUFFER = 24;
const LAYOUT_PROPERTIES = ['height', 'minHeight', 'maxHeight', 'blockSize', 'gridTemplateRows', 'flexBasis'];

type ResizeMode = 'content' | 'language' | 'period';

const periodOrigins = new WeakMap<HTMLElement, Map<HTMLElement, { height: number; limit: number }>>();

/** Read the painted edge before the new period can change layout or scroll. */
export function capturePeriodCardHeights(section: HTMLElement, viewportBottom: number | null) {
  if (viewportBottom === null) {
    periodOrigins.delete(section);
    return;
  }
  const origins = new Map<HTMLElement, { height: number; limit: number }>();
  for (const card of section.querySelectorAll<HTMLElement>(CARDS)) {
    const rect = card.getBoundingClientRect();
    if (rect.top >= viewportBottom) continue;
    const limit = viewportBottom - rect.top + PERIOD_EDGE_BUFFER;
    origins.set(card, { height: Math.min(rect.height, limit), limit });
  }
  periodOrigins.set(section, origins);
}

interface CardState {
  element: HTMLElement;
  width: number;
  height: number;
  animation: Animation | null;
  mode: ResizeMode;
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
    const targets: { state: CardState; width: number; height: number }[] = [];
    for (const entry of entries) {
      const state = states.get(entry.target as HTMLElement);
      if (state && !state.animation && !languageHeights) {
        const card = state.element;
        targets.push({ state, width: card.offsetWidth, height: card.offsetHeight });
      }
    }
    // Measure paired grid cards before the first animated height can alter
    // the other card's layout.
    for (const { state, width, height } of targets) {
      update(state, state.height, 'content', { width, height });
    }
  });

  function update(state: CardState, from = state.height, mode: ResizeMode = 'content', measured?: { width: number; height: number; limit?: number }) {
    const card = state.element;
    const width = measured?.width ?? card.offsetWidth, height = measured?.height ?? card.offsetHeight;
    const end = Math.min(height, measured?.limit ?? height);
    const previousWidth = state.width;
    state.width = width; state.height = height;
    if (disposed || !card.isConnected || reduced.matches || document.hidden || card.closest(EXCLUDED)
      || !card.getClientRects().length || !width || !height || !from
      || (mode !== 'language' && (card.parentElement?.closest(CARDS) || Math.abs(width - previousWidth) > 1)) || Math.abs(end - from) < 2) return;
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
      [{ height: `${from}px` }, { height: `${end}px` }],
      {
        duration: mode === 'language' ? LANGUAGE_DURATION : mode === 'period' ? PERIOD_DURATION : DURATION,
        easing: mode === 'content' ? 'cubic-bezier(.22,.78,.22,1)' : PERIOD_EASING,
        fill: mode === 'period' ? 'backwards' : 'none',
      },
    );
    animation.id = ANIMATION_ID;
    state.animation = animation; state.mode = mode;
    animation.onfinish = () => {
      if (disposed || state.animation !== animation) return;
      state.animation = null; state.mode = 'content';
      card.classList.remove('pb-card-resizing');
      if (!card.isConnected || !states.has(card)) return;
      // Content may have changed while resizing. The final height remains auto.
      if (mode === 'period') {
        state.width = card.offsetWidth;
        state.height = card.offsetHeight;
      } else update(state);
      if (!state.animation) observe(card);
    };
    animation.oncancel = () => {
      if (disposed || state.animation !== animation) return;
      state.animation = null; state.mode = 'content';
      card.classList.remove('pb-card-resizing');
      if (!card.isConnected || !states.has(card)) return;
      state.width = card.offsetWidth; state.height = card.offsetHeight;
      observe(card);
    };
  }

  function register(card: HTMLElement) {
    if (states.has(card) || card.closest(EXCLUDED)) return;
    states.set(card, { element: card, width: card.offsetWidth, height: card.offsetHeight, animation: null, mode: 'content' });
    observe(card);
  }
  function discover(node: Node) {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(CARDS)) register(node);
    node.querySelectorAll<HTMLElement>(CARDS).forEach(register);
  }
  function cancelResize(state: CardState) {
    const animation = state.animation;
    if (!animation) return;
    animation.onfinish = null;
    animation.oncancel = null;
    animation.cancel();
    state.animation = null;
    state.mode = 'content';
    state.element.classList.remove('pb-card-resizing');
  }

  root.querySelectorAll<HTMLElement>(CARDS).forEach(register);
  const mutation = new MutationObserver(records => {
    // A period switch owns one measurement and one motion before paint.
    // Internal row changes during the transition cannot restart its height.
    for (const record of records) {
      if (record.attributeName !== RESET_ATTRIBUTE || !(record.target instanceof HTMLElement)) continue;
      const section = record.target;
      const direction = Number(section.getAttribute('data-pb-resize-transition'));
      const animate = (direction === 1 || direction === -1) && !document.hidden && !reduced.matches;
      const origins = periodOrigins.get(section);
      periodOrigins.delete(section);
      const cards = Array.from(section.querySelectorAll<HTMLElement>(CARDS)).flatMap(card => {
        const state = states.get(card);
        return state ? [{ card, state, origin: origins?.get(card) }] : [];
      });
      for (const { card, state } of cards) {
        cancelResize(state);
        languageHeights?.delete(card);
      }
      const targets = cards.map(item => ({ ...item, width: item.card.offsetWidth, height: item.card.offsetHeight }));
      for (const { card, state, origin, width, height } of targets) {
        // Hand back to intrinsic height beyond the viewport, after the
        // visible edge has already entered or left the screen.
        if (animate && origin) update(state, origin.height, 'period', { width, height, limit: origin.limit });
        else { state.width = width; state.height = height; }
        if (!state.animation) observe(card);
      }
      for (const body of section.querySelectorAll<HTMLElement>('[data-pb-period-body]')) {
        for (const fade of body.getAnimations()) if (fade.id === PERIOD_FADE) fade.cancel();
        if (!animate) continue;
        const fade = body.animate([
          { opacity: .22, translate: `0 ${direction * 12}px` },
          { opacity: 1, translate: '0 0' },
        ], { duration: 260, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' });
        fade.id = PERIOD_FADE;
      }
    }
    // Locale subscribers can commit separately. Never consume the snapshot
    // on an incidental mutation before translated content has committed.
    if (languageHeights) return;
    for (const [card, state] of states) {
      if (!card.isConnected) {
        states.delete(card); resize.unobserve(card); state.animation?.cancel();
      } else if (state.animation && state.mode === 'content' && records.some(record => card.contains(record.target))) {
        // A rapid update continues from the visible height, not an old target.
        const currentHeight = card.offsetHeight;
        cancelResize(state);
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
      for (const { state, from, width, height } of targets) update(state, from, 'language', { width, height });
    }
  };
  mutation.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-busy', RESET_ATTRIBUTE] });
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
