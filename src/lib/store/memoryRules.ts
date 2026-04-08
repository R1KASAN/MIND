import { getActions, getSession, saveActions, saveSession } from './idb';
import { trackEvent } from '@/lib/instrumentation';

// T029: Use local timezone week boundary (Monday midnight, local time)
function getStartOfLocalWeek(): number {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffDays = day === 0 ? -6 : 1 - day; // Roll back to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffDays);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

// T031: processWeeklySweep — archives non-pinned old items and resets reset notice flag
export async function processWeeklySweep() {
  const [actions, session] = await Promise.all([getActions(), getSession()]);
  if (actions.length === 0) return;

  const weekStart = getStartOfLocalWeek();

  let modified = false;
  let pinnedCount = 0;

  // Sort newest first so we keep the most recent pins if over cap
  const sorted = [...actions].sort((a, b) => b.createdAt - a.createdAt);

  const newActions = sorted.map((action) => {
    // Already terminal — skip
    if (action.state === 'ARCHIVED') return action;

    const actionIsOld = action.createdAt < weekStart;

    if (actionIsOld) {
      if (action.isPinned && pinnedCount < 3) {
        pinnedCount++;
        return action; // Pinned items survive the sweep
      } else {
        modified = true;
        return { ...action, state: 'ARCHIVED' as const, isPinned: false };
      }
    } else {
      if (action.isPinned) pinnedCount++;
      return action;
    }
  });

  if (modified) {
    trackEvent('weekly_reset_applied');
    await saveActions(newActions);

    // T031: Reset notice flag so the dismissal banner fires next DUMP_ENTRY render
    const updatedSession = { ...session, hasSeenResetNotice: false };
    await saveSession(updatedSession);
  }
}
