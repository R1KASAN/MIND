import { appendAnalyticsEvent } from '@/lib/analytics/local-analytics';

export type EventName = 
  | 'app_launch'
  | 'dump_submitted'
  | 'task_opened'
  | 'first_action_selected'
  | 'synthesis_started'
  | 'synthesis_completed'
  | 'synthesis_failed'
  | 'fallback_manual_sort_shown'
  | 'manual_fallback_triggered'
  | 'action_shown'
  | 'action_accepted'
  | 'action_rejected'
  | 'scaffold_started'
  | 'scaffold_completed'
  | 'rescue_triggered'
  | 'rescue_resolved'
  | 'bounce_back_opened'
  | 'bounce_back_resumed'
  | 'reentry_suggestion_selected'
  | 'reentry_started'
  | 'reentry_understood'
  | 'studio_intent_clicked'
  | 'studio_intent_resolved'
  | 'studio_intent_blocked'
  | 'studio_snapshot_viewed'
  | 'archive_searched'
  | 'overview_opened'
  | 'clarification_shown'
  | 'clarification_answered'
  | 'morning_ritual_shown'
  | 'morning_ritual_skipped'
  | 'morning_ritual_accepted'
  | 'morning_ritual_reentry_suggested'
  | 'morning_ritual_reentry_checkpoint'
  | 'walkthrough_opened'
  | 'healthcheck_passed'
  | 'ollama_unavailable'
  | 'model_missing'
  | 'timeout_fallback'
  | 'retry_clicked'
  | 'retry_success'
  | 'retry_failed'
  | 'time_to_action_ms'
  | 'task_completed'
  | 'data_exported'
  | 'data_deleted'
  | 'pinned_item_created'
  | 'weekly_reset_applied'
  | 'client_response_submitted'
  | 'client_resume_submitted'
  | 'reply_draft_copied'
  | 'blocker_detected'
  | 'blocker_addressed'
  | 'workflow_classified'
  | 'recovery_retry_shown'
  | 'recovery_manual_chosen'
  | 'active_context_preserved'
  | 'action_negotiated'
  | 'one_action_accepted_first_try'
  | 'one_action_viewed_alternative'
  | 'one_action_adjustment_clicked'
  | 'metrics_dashboard_opened'
  | 'value_pulse_shown'
  | 'value_pulse_submitted'
  | 'value_pulse_dismissed';

export type EventProperties = Record<string, unknown>;

export function trackEvent(name: EventName, properties?: EventProperties) {
  // In a real beta, this might hit PostHog or a similar lightweight endpoint
  console.log(`[EVENT] ${name}`, properties || {});
  void appendAnalyticsEvent(name, properties);
}

// Hook wrapper for React components if needed
import { useEffect } from 'react';

export function useTrackMountEvent(name: EventName, properties?: EventProperties, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    trackEvent(name, properties);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
