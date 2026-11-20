import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function GoalDismissButton({ name, onClick, compact }: {
  name: string;
  onClick: () => void;
  compact?: boolean;
}) {
  const { d, t } = useTranslation();
  const ux = d.ux.goals;
  const label = t(ux.dismissGoal, { name });
  return (
    <button
      type="button"
      className={compact ? 'icon-btn pb-goals-tl-add' : 'pill pb-goal-dismiss'}
      aria-label={label}
      title={compact ? label : undefined}
      onClick={onClick}
    >
      <X size={15} aria-hidden="true" />
      {!compact && ux.dismiss}
    </button>
  );
}
