'use client';

import type { ReactNode, ComponentType, SVGProps } from 'react';
import WholeFoods from '@thesvg/react/whole-foods-market';
import Costco from '@thesvg/react/costco';
import Amazon from '@thesvg/react/amazon-badge';
import Starbucks from '@thesvg/react/starbucks';
import Walmart from '@thesvg/react/walmart';
import Target from '@thesvg/react/target';
import Kroger from '@thesvg/react/kroger';
import Aldi from '@thesvg/react/aldi-sud';
import McDonalds from '@thesvg/react/mcdonalds';
import BurgerKing from '@thesvg/react/burger-king';
import TacoBell from '@thesvg/react/taco-bell';
import Subway from '@thesvg/react/subway';
import DoorDash from '@thesvg/react/doordash';
import Instacart from '@thesvg/react/instacart';
import Uber from '@thesvg/react/uber';
import Lyft from '@thesvg/react/lyft';
import Netflix from '@thesvg/react/netflix';
import Spotify from '@thesvg/react/spotify';
import Hulu from '@thesvg/react/hulu';
import Apple from '@thesvg/react/apple';
import YouTube from '@thesvg/react/youtube';
import Ikea from '@thesvg/react/ikea';
import HomeDepot from '@thesvg/react/home-depot';
import BestBuy from '@thesvg/react/best-buy';
import Walgreens from '@thesvg/react/walgreens';
import Cvs from '@thesvg/react/cvs';
import { usePebbleStore } from '@/store/usePebbleStore';
import { detectTransactionBrand, type TransactionBrand } from '@/lib/transactionBrand';

// Per-icon imports: only these logos enter the app bundle, not the catalog.
const LOGOS: Record<TransactionBrand, ComponentType<SVGProps<SVGSVGElement>>> = {
  'whole-foods-market': WholeFoods, costco: Costco, amazon: Amazon,
  starbucks: Starbucks, walmart: Walmart, target: Target, kroger: Kroger,
  'aldi-sud': Aldi, mcdonalds: McDonalds, 'burger-king': BurgerKing,
  'taco-bell': TacoBell, subway: Subway, doordash: DoorDash,
  instacart: Instacart, uber: Uber, lyft: Lyft, netflix: Netflix,
  spotify: Spotify, hulu: Hulu, apple: Apple, youtube: YouTube, ikea: Ikea,
  'home-depot': HomeDepot, 'best-buy': BestBuy, walgreens: Walgreens, cvs: Cvs,
};

/** The existing tile owns its layout/tint. Only its icon changes. A white
 * inset keeps original brand colours readable in every light/dark theme.
 * Omit description for balance adjustments and other non-merchant records.
 */
export function TransactionIcon({ description, fallback, size = 16 }: {
  description?: string;
  fallback: ReactNode;
  size?: number;
}) {
  const enabled = usePebbleStore(s => s.showBrandIcons) !== false;
  const brand = enabled && description ? detectTransactionBrand(description) : null;
  if (!brand) return fallback;
  const Logo = LOGOS[brand];
  return <span data-pb-transaction-brand={brand} aria-hidden="true" style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: size + 12, height: size + 12, padding: 3, boxSizing: 'border-box',
    flexShrink: 0, borderRadius: 5, backgroundColor: '#fff', color: '#202020',
  }}>
    <Logo width="100%" height="100%" focusable="false" aria-hidden="true" />
  </span>;
}
