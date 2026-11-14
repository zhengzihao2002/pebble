'use client';

import { Curve, type CurveProps } from 'recharts';

/** Shape for Line series with isAnimationActive={false}. Recharts still reads
 * the default path's length during resize even when its animation is disabled.
 * The same public Curve renderer without an animation ref avoids that forced
 * layout while preserving line geometry, stacking, dots and tooltips. */
export function StaticChartCurve(props: CurveProps) {
  return <Curve {...props} pathRef={undefined} />;
}
