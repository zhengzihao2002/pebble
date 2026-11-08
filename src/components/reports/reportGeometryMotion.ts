/** Use one transform pipeline for every surface. Mixing compositor transforms
 * and layout width/height animation can drift during rapid reversals. */
export function reportGeometryFrames(before: DOMRect, after: DOMRect, radius: number, rightAnchored = false): Keyframe[] {
  return Array.from({ length: 33 }, (_, index) => {
    const p = index / 32;
    const sx = 1 + (before.width / after.width - 1) * (1 - p);
    const sy = 1 + (before.height / after.height - 1) * (1 - p);
    const dx = (rightAnchored ? before.right - after.right : before.left - after.left) * (1 - p);
    const dy = (before.top - after.top) * (1 - p);
    const r = Math.min(radius, after.width * sx / 2, after.height * sy / 2);
    return {
      offset: p,
      transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      // Counter-scale the corners so their visible curvature does not wobble.
      borderRadius: `${r / sx}px / ${r / sy}px`,
    };
  });
}
