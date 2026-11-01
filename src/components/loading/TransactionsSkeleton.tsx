import { Skeleton } from '@/components/kit/Skeleton';
import { LoadingStatus } from '@/components/transactions/LoadingStatus';

/** Match the real summary/search/statement hierarchy without sticky-frame
 * margins, so cloning this estimate for the handoff cannot move its cards. */
export function TransactionsSkeleton() {
  return (
    <div className="pb-txn-skel-page">
      <LoadingStatus />
      <div className="pb-txn-skel-summary">
        <div className="card pb-txn-skel-card">
          <Skeleton width="4rem" height="0.7rem" />
          <Skeleton width="10rem" height="2.4rem" radius="0.7rem" />
          {[0, 1, 2].map(i => <div key={i} className="pb-page-skel-row">
            <Skeleton width={24} height={24} radius="0.4rem" />
            <div><Skeleton width="70%" height="0.8rem" /></div>
            <Skeleton width="4rem" height="0.8rem" />
          </div>)}
        </div>
        <div className="card pb-txn-skel-card">
          <Skeleton width="5rem" height="0.7rem" />
          <Skeleton width="10rem" height="1.4rem" />
          <div className="pb-txn-skel-chips">
            {Array.from({ length: 13 }, (_, i) => <Skeleton key={i} width="3.2rem" height="3.4rem" radius="0.85rem" style={{ flex: 'none' }} />)}
          </div>
          <Skeleton height="14px" radius="999px" />
          <Skeleton height="3rem" />
        </div>
        <div className="card pb-txn-skel-card">
          <Skeleton width="9rem" height="0.8rem" />
          <Skeleton height="10rem" />
        </div>
      </div>
      <div className="pb-txn-skel-statement">
        <div className="card pb-txn-skel-search">
          <Skeleton height="2.6rem" radius="0.7rem" style={{ flex: 1 }} />
          <Skeleton width="6rem" height="2.6rem" radius="0.7rem" />
        </div>
        <div className="card" style={{ overflow: 'clip' }}>
          <div className="pb-txn-skel-card"><Skeleton width="8rem" height="0.9rem" /><Skeleton width="12rem" height="0.7rem" /></div>
          {[0, 1, 2].map(g => <div key={g}>
            <div className="pb-txn-skel-row" style={{ paddingBlock: '0.55rem' }}><Skeleton width="7rem" height="0.7rem" /></div>
            {[0, 1, 2].map(r => <div key={r} className="pb-txn-skel-row">
              <Skeleton width={36} height={36} radius="0.65rem" style={{ flex: 'none' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><Skeleton width="55%" height="0.8rem" /><Skeleton width="30%" height="0.65rem" /></div>
              <Skeleton width="4.5rem" height="0.8rem" />
            </div>)}
          </div>)}
        </div>
      </div>
    </div>
  );
}
