import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { getGoals } from '@/lib/data/queries';
import { GoalCard } from '@/components/goals/GoalCard';
import { ComingSoonOverlay } from '@/components/shared/ComingSoonOverlay';

export const dynamic = 'force-dynamic';

// No client shell: this page has no interactive state. GoalCard resolves its
// own icon from goal.iconKey, so no LucideIcon crosses the server/client
// boundary.
//
// The Coming Soon overlay stays, and AddGoalModal still has no trigger.
// Both preserved deliberately - this phase wires up data, it does not ship
// the Goals feature.
export default async function GoalsPage() {
  const userId = await getSessionUserIdOrRedirect();
  const goals = await getGoals(userId);

  return (
    <div style={{ position: 'relative', minHeight: '420px' }}>
      <div className="goals-grid" style={{ pointerEvents: 'none' }}>
        {goals.map((g) => <GoalCard key={g.id} goal={g} />)}
      </div>
      <ComingSoonOverlay label="Under construction" />
    </div>
  );
}
