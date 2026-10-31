import { Skeleton } from '@/components/kit/Skeleton';
import type { ReactNode } from 'react';

function Lines({ count = 3 }: { count?: number }) {
  return <>{Array.from({ length: count }, (_, i) => <div className="pb-page-skel-row" key={i}>
    <Skeleton width="2rem" height="2rem" radius=".6rem" />
    <div><Skeleton width={i % 2 ? '55%' : '75%'} height=".7rem" /><Skeleton width="40%" height=".55rem" /></div>
    <Skeleton width="4rem" height=".9rem" />
  </div>)}</>;
}
function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`card pb-page-skel-card ${className}`} aria-hidden="true">{children}</section>;
}
function Figure() { return <><Skeleton width="7rem" height=".7rem" /><Skeleton width="12rem" height="2.5rem" /><Skeleton width="10rem" height=".7rem" /></>; }
function Chart({ height = 140 }: { height?: number }) { return <Skeleton height={height} radius=".75rem" />; }
function Tiles({ count = 3 }: { count?: number }) { return <div className="pb-page-skel-tiles">{Array.from({length:count}, (_,i)=><Card key={i}><Figure/><Skeleton height=".45rem"/><Lines count={1}/></Card>)}</div>; }

/** Same page grids and card classes as the destinations; no invented shared page. */
export function AccountsSkeleton() { return <div className="pb-accounts pb-page-skeleton" data-skeleton="accounts" aria-busy="true"><Card className="pb-accounts-hero"><Figure/><Chart height={180}/></Card><Card><Skeleton width="9rem"/><Skeleton height=".6rem"/></Card><Tiles/><Card><Chart height={180}/></Card></div>; }
export function InsightsSkeleton() { return <div className="pb-ins pb-page-skeleton" data-skeleton="insights" aria-busy="true"><Card><Skeleton height="1.75rem" radius="999px"/></Card><div className="pb-ins-grid">{['hero','rail','pace','cal','week','trends','places','good'].map((area,i)=><div className={`pb-ins-area pb-ins-area-${area}`} key={area}><Card className="pb-ins-card"><Skeleton width="8rem"/>{i===0?<Figure/>:i===3?<Chart height={260}/>:<Lines count={i===1?3:4}/>}</Card></div>)}</div></div>; }
export function BudgetsSkeleton() { return <div className="pb-bud pb-page-skeleton" data-skeleton="budgets" aria-busy="true"><Card><Figure/><div className="pb-page-skel-tiles"><Chart/><Chart/></div><Skeleton height=".6rem"/></Card><Card><Skeleton width="10rem"/><Lines count={5}/></Card><Card><Skeleton width="13rem"/><Lines count={2}/></Card></div>; }
export function GoalsSkeleton() { return <div className="pb-goals pb-page-skeleton" data-skeleton="goals" aria-busy="true"><Card className="pb-goals-hero"><Skeleton width="11rem"/><Figure/><Skeleton height=".65rem"/><div className="pb-page-skel-tiles"><Skeleton height="2.4rem"/><Skeleton height="2.4rem"/></div></Card><Tiles/></div>; }
export function ScheduledSkeleton() { return <div className="pb-sched pb-page-skeleton" data-skeleton="scheduled" aria-busy="true"><Card className="pb-sched-card"><Skeleton width="10rem"/><div className="pb-page-skel-tiles"><Figure/><Figure/><Figure/></div></Card><Card className="pb-sched-card"><Chart height={210}/></Card><div className="pb-sched-cols"><Card className="pb-sched-card"><Skeleton width="9rem"/><Lines count={4}/></Card><Card className="pb-sched-card"><Skeleton width="11rem"/><Lines count={4}/></Card></div></div>; }
export function SettingsSkeleton() { return <div className="settings-layout pb-settings pb-page-skeleton" data-skeleton="settings" aria-busy="true"><aside className="settings-nav"><Card><Lines count={5}/></Card></aside><div className="settings-column">{[0,1,2].map(i=><section className="settings-section" key={i}><Skeleton width="9rem" height="1.4rem"/><Skeleton width="16rem" height=".7rem"/><Card className="pb-settings-group"><Lines count={3}/></Card></section>)}</div></div>; }
export function PlannerSkeleton() { return <div className="pb-annual pb-page-skeleton" data-skeleton="planner" aria-busy="true"><Skeleton width="12rem" height="2rem"/><Card><Figure/><Skeleton height=".6rem"/></Card>{[0,1,2].map(i=><Card key={i}><Lines count={1}/><Skeleton height="3rem"/></Card>)}</div>; }
export function AccountSettingsSkeleton() { return <div className="pb-page-skeleton" data-skeleton="account" aria-busy="true"><Skeleton width="15rem" height="2.5rem"/>{[0,1].map(i=><Card key={i}><Skeleton width="10rem"/><Lines count={3}/></Card>)}</div>; }
