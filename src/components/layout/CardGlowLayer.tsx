'use client';

import { useLayoutEffect, useRef } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { CARD_GLOW_PAD, createCardGlowRenderer, type GlowColour, type GlowRect, type GlowSurface } from '@/lib/cardGlowRenderer';

const HOSTS = '.card,[data-slot="card"],.pb-hero,.pb-modal-card,.pb-settings-tile,.pb-accounts-tile,.add-goal-tile,.pb-rep-rail,.stat-tab';
const EXCLUDED = '.pb-import-split,.pb-annual-balance';
const IGNORED = '.pb-card-glow-layer,.pb-ambient-background,.pb-ambient-studio,.pb-ambient-route-preview';
const INTERESTING = /^(transform|translate|scale|opacity|width|height|padding|margin|border.*radius|color|--pine)$/i;

function radius(value: string, width: number, height: number, scale: number) {
  const pieces = value.split(/\s+/);
  const px = (text: string, length: number) => text.endsWith('%') ? parseFloat(text) * length / 100 : parseFloat(text) * scale;
  return Math.max(0, Math.min(px(pieces[0], width) || 0, px(pieces[1] ?? pieces[0], height) || 0, width / 2, height / 2));
}

function PaintedGlow({ scope }: { scope: 'page' | 'modal' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current, host = canvas?.parentElement;
    if (!canvas || !host) return;
    const renderer = createCardGlowRenderer(canvas);
    if (!renderer) return;
    const root = host.closest('.pebble-root') ?? host;
    const colourCanvas = document.createElement('canvas');
    colourCanvas.width = 1; colourCanvas.height = 1;
    const colourContext = colourCanvas.getContext('2d', { willReadFrequently: true });
    let colourKey = '', colour: GlowColour = [31, 90, 69];
    let frame = 0, alive = true, targets: HTMLElement[] = [];
    const resize = new ResizeObserver(() => queue());
    const eligible = (element: HTMLElement) => {
      if (element.matches(EXCLUDED) || element.closest('.pb-modal-overlay') !== (scope === 'modal' ? host : null)) return false;
      for (let parent = element.parentElement; parent && parent !== host; parent = parent.parentElement) {
        if (parent.matches(HOSTS) && !parent.matches(EXCLUDED)) return false;
      }
      return true;
    };
    const syncTargets = () => {
      const next = [...host.querySelectorAll<HTMLElement>(HOSTS)].filter(eligible);
      const nextSet = new Set(next);
      targets.forEach(target => { if (!nextSet.has(target)) resize.unobserve(target); });
      const old = new Set(targets);
      next.forEach(target => { if (!old.has(target)) resize.observe(target, { box: 'border-box' }); });
      targets = next;
    };
    const animated = (element: Element) => element.getAnimations().some(animation => {
      if (animation.playState !== 'running' && !animation.pending) return false;
      const effect = animation.effect;
      return effect instanceof KeyframeEffect && effect.getKeyframes().some(keyframe => Object.keys(keyframe).some(key => INTERESTING.test(key)));
    });
    const paint = () => {
      frame = 0;
      if (!alive || document.hidden) return;
      const bounds = canvas.getBoundingClientRect(), width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
      const tone = getComputedStyle(canvas).color;
      if (tone !== colourKey && colourContext) {
        colourContext.clearRect(0, 0, 1, 1); colourContext.fillStyle = tone; colourContext.fillRect(0, 0, 1, 1);
        const pixel = colourContext.getImageData(0, 0, 1, 1).data;
        colour = [pixel[0], pixel[1], pixel[2]]; colourKey = tone;
      }
      const surfaces: GlowSurface[] = [];
      const motion = new Set<Element>([root, host, canvas]);
      for (const target of targets) {
        const rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom < bounds.top - CARD_GLOW_PAD || rect.top > bounds.bottom + CARD_GLOW_PAD || rect.right < bounds.left - CARD_GLOW_PAD || rect.left > bounds.right + CARD_GLOW_PAD) continue;
        const style = getComputedStyle(target);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        let opacity = 1, clip: GlowRect | undefined;
        const escapedPane = target.hasAttribute('data-pb-pane-shadow');
        for (let node: HTMLElement | null = target; node && node !== host; node = node.parentElement) {
          const current = node === target ? style : getComputedStyle(node);
          opacity *= Number(current.opacity);
          motion.add(node);
          if (node === target || escapedPane || !/hidden|clip|auto|scroll/.test(`${current.overflowX} ${current.overflowY}`)) continue;
          const box = node.getBoundingClientRect();
          const x = Math.max(clip?.x ?? -Infinity, /hidden|clip|auto|scroll/.test(current.overflowX) ? box.left - bounds.left : -CARD_GLOW_PAD);
          const y = Math.max(clip?.y ?? -Infinity, /hidden|clip|auto|scroll/.test(current.overflowY) ? box.top - bounds.top : -CARD_GLOW_PAD);
          const right = Math.min(clip ? clip.x + clip.width : Infinity, /hidden|clip|auto|scroll/.test(current.overflowX) ? box.right - bounds.left : width + CARD_GLOW_PAD);
          const bottom = Math.min(clip ? clip.y + clip.height : Infinity, /hidden|clip|auto|scroll/.test(current.overflowY) ? box.bottom - bounds.top : height + CARD_GLOW_PAD);
          clip = { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
        }
        if (!opacity) continue;
        const scale = rect.width / Math.max(1, target.offsetWidth);
        surfaces.push({
          x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height, opacity, clip,
          radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
            .map(value => radius(value, rect.width, rect.height, scale)) as GlowSurface['radii'],
        });
      }
      renderer.draw(width, height, surfaces, colour);
      canvas.dataset.cards = String(surfaces.length);
      if ([...motion].some(animated)) queue();
    };
    function queue() { if (alive && !document.hidden && !frame) frame = requestAnimationFrame(paint); }
    const relevant = (element: Element) => !element.closest(IGNORED) && (element === host || element === root || element.matches(HOSTS) || !!element.querySelector(HOSTS));
    const changes = new MutationObserver(records => {
      let children = false, dirty = false;
      for (const record of records) {
        if (!(record.target instanceof Element) || record.target.closest(IGNORED)) continue;
        if (record.type === 'childList') {
          const elements = [...record.addedNodes, ...record.removedNodes].filter((node): node is Element => node instanceof Element);
          if (elements.some(relevant)) { children = true; dirty = true; }
        } else if (relevant(record.target)) dirty = true;
      }
      if (children) syncTargets();
      if (dirty) queue();
    });
    changes.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-pb-pane-shadow'] });
    const palette = new MutationObserver(queue);
    palette.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-pebble-theme'] });
    const motionChanged = (event: Event) => { if (event.target instanceof Element && relevant(event.target)) queue(); };
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else { syncTargets(); queue(); }
    };
    syncTargets(); resize.observe(host); resize.observe(canvas);
    if (scope === 'page') host.querySelectorAll('.pebble-header,.pebble-main').forEach(element => resize.observe(element));
    host.addEventListener('scroll', queue, { passive: true, capture: true });
    window.addEventListener('resize', queue, { passive: true });
    window.visualViewport?.addEventListener('resize', queue, { passive: true });
    window.visualViewport?.addEventListener('scroll', queue, { passive: true });
    for (const event of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel']) host.addEventListener(event, motionChanged, true);
    document.addEventListener('visibilitychange', visibility);
    document.fonts?.ready.then(() => { if (alive) queue(); });
    paint();
    return () => {
      alive = false; cancelAnimationFrame(frame); resize.disconnect(); changes.disconnect(); palette.disconnect(); renderer.dispose();
      host.removeEventListener('scroll', queue, true); window.removeEventListener('resize', queue);
      window.visualViewport?.removeEventListener('resize', queue); window.visualViewport?.removeEventListener('scroll', queue);
      for (const event of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel']) host.removeEventListener(event, motionChanged, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [scope]);
  return <canvas ref={ref} className="pb-card-glow-layer" data-scope={scope} aria-hidden="true" style={{ color: 'var(--pine)' }} />;
}

/** One paint plane per page/backdrop; the same halo path runs on every browser. */
export function CardGlowLayer({ scope = 'page' }: { scope?: 'page' | 'modal' }) {
  const enabled = usePebbleStore(state => state.showCardGlow) !== false;
  return enabled ? <PaintedGlow scope={scope} /> : null;
}
