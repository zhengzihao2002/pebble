import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  className?: string;
  style?: CSSProperties;
}

/**
 * A placeholder block in the shape of the content that is on its way. A soft
 * sheen passes over it; under reduced motion it rests still. Always
 * decorative - the loading state's own status text is what is announced.
 */
export function Skeleton({ width = '100%', height = '1rem', radius = '0.5rem', className, style }: SkeletonProps) {
  return (
    <span
      className={`pb-skel${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
