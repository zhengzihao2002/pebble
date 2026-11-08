import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/components/reports/ReportFilters.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime', 'lucide-react', '@/lib/i18n/useTranslation', '@/lib/i18n/enumLabels'],
}).outputFiles[0].text;

function fixture({ managed = false } = {}) {
  const trace = [], effects = [], observers = [], frames = new Map(), cleanups = [];
  let nextFrame = 0, nextRef = 0, ready;
  const eventTarget = () => {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      emit(type, event = {}) { for (const fn of [...listeners.get(type) ?? []]) fn(event); },
      get listenerCount() { return [...listeners.values()].reduce((count, set) => count + set.size, 0); },
    };
  };
  const geometry = { top: 100, nav: 80, content: 500 };
  const values = new Map();
  const root = Object.assign(eventTarget(), {
    querySelector(selector) { return selector === '.pebble-bottom-nav' ? { getBoundingClientRect() { trace.push('read:nav'); return { height: geometry.nav }; } } : null; },
  });
  const page = {};
  const card = Object.assign(eventTarget(), {
    managed,
    style: {
      getPropertyValue(property) { return values.get(property) ?? ''; },
      setProperty(property, value) { trace.push(`write:${property}`); values.set(property, value); },
    },
    closest(selector) { return selector === '.pebble-root' ? root : selector === '.pb-rep' ? page : this.managed ? {} : null; },
    getBoundingClientRect() { trace.push('read:card'); return { top: geometry.top }; },

  });
  Object.defineProperties(card, {
    clientWidth: { get() { trace.push('read:card-width'); return 328; } },
    clientHeight: { get() { trace.push('read:card-height'); return geometry.content + 2; } },
  });
  const content = {
    get offsetWidth() { trace.push('read:content-width'); return 326; },
    get offsetHeight() { trace.push('read:content-height'); return geometry.content; },
  };
  const media = Object.assign(eventTarget(), { matches: false });
  const window = Object.assign(eventTarget(), {
    innerHeight: 1000, matchMedia: () => media,
    setTimeout: () => 1, clearTimeout() {},
  });
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, window,
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
    getComputedStyle(element) {
      trace.push(element === content ? 'read:content-style' : 'read:card-style');
      return { height: `${geometry.content}px`, getPropertyValue: () => '1' };
    },
    require(name) {
      if (name === 'react') return {
        useId: () => 'test', useRef: () => ({ current: [card, content][nextRef++] }),
        useState: value => [value, update => { ready = update; }], useLayoutEffect: fn => effects.push(fn),
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === '@/lib/i18n/useTranslation') return { useTranslation: () => ({ d: { reports: {}, txnSearch: {}, ux: { reports: {} } }, t: () => '' }) };
      if (name === '@/lib/i18n/enumLabels') return { categoryLabel: () => '', periodValueLabel: () => '' };
      return {};
    },
  });
  compiled.exports.ReportFilters({ expanded: true, selectedTypes: new Set(['income', 'expense']), selectedAccounts: new Set(), selectedCategories: new Set(), selectedTags: new Set(),
    allSelected: true, accounts: [], periodAccounts: [], periodCategories: [], availableTags: [], descQuery: '', subPeriodOptions: null });
  cleanups.push(...effects.map(fn => fn()));
  const flushFrames = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } };
  const writes = () => trace.filter(item => item.startsWith('write:'));
  return { trace, card, content, geometry, root, page, media, window, values, observers, flushFrames, writes, ready: () => ready,
    cleanup() { cleanups.forEach(fn => fn?.()); } };
}

test('filter measurement batches layout reads before variable writes and does not rewrite identical values', () => {
  const f = fixture();
  const firstWrite = f.trace.findIndex(item => item.startsWith('write:'));
  assert.ok(firstWrite > f.trace.lastIndexOf('read:content-style'), 'Changing the viewport limit must not force a second layout read in the same pass');
  assert.equal(f.values.get('--pb-rep-filter-available'), '804px');
  assert.equal(f.values.get('--pb-rep-filter-height'), '502px');
  f.trace.length = 0;
  f.observers[0].callback([{ target: f.content }]);
  assert.deepEqual(f.writes(), [], 'Unchanged measurements must not invalidate styles or wake global mutation observers');
  f.cleanup();
});

test('managed grid motion does no filter measurement and refreshes the latest viewport when settled', () => {
  const f = fixture({ managed: true });
  assert.deepEqual(f.trace, [], 'The shared owner already measures final geometry');
  assert.equal(f.ready(), false);
  f.geometry.top = 160; f.geometry.nav = 64; f.geometry.content = 420; f.window.innerHeight = 900;
  f.observers[0].callback([{ target: f.content }]);
  f.observers[0].callback([{ target: f.page }]);
  f.root.emit('scroll'); f.flushFrames();
  assert.deepEqual(f.trace, [], 'Animated page heights and scroll events must not force duplicate layout while managed');
  f.card.managed = false;
  f.card.emit('pb-report-inspector-settled');
  assert.equal(f.values.get('--pb-rep-filter-available'), '660px', 'Apply the latest viewport, nav height and scroll position at settlement');
  assert.equal(f.values.get('--pb-rep-filter-height'), '422px');
  assert.equal(f.ready(), true, 'Visible real controls become ready after their owner releases geometry');
  // A reversal can settle and immediately acquire ownership again.
  f.card.managed = true; f.trace.length = 0;
  f.observers[0].callback([{ target: f.content }]);
  assert.deepEqual(f.trace, []);
  f.card.managed = false; f.geometry.content = 460;
  f.card.emit('pb-report-inspector-settled');
  assert.equal(f.values.get('--pb-rep-filter-height'), '462px');
  f.cleanup();
});

test('normal scroll and viewport resize still update limits and cleanup releases observers', () => {
  const f = fixture();
  f.trace.length = 0; f.geometry.top = 50;
  f.root.emit('scroll'); f.flushFrames();
  assert.equal(f.values.get('--pb-rep-filter-available'), '854px');
  assert.deepEqual(f.writes(), ['write:--pb-rep-filter-available']);
  f.window.innerHeight = 800;
  f.window.emit('resize'); f.flushFrames();
  assert.equal(f.values.get('--pb-rep-filter-available'), '654px');
  f.cleanup();
  assert.ok(f.observers.every(observer => observer.disconnected));
  assert.equal(f.card.listenerCount + f.root.listenerCount + f.window.listenerCount + f.media.listenerCount, 0);
});
