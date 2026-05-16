import type { CurrentPlanStep, PlanGeneratedBy, PlanSourceKindLabel } from '@/lib/store/idb';
import { formatConfidenceLabel } from './plan-provenance';

export function hasRetrievedEvidence(step?: CurrentPlanStep): boolean {
  return Boolean(step?.evidence?.some((item) => item.sourceKindLabel === 'retrieved'));
}

export function formatSourceKindLabel(value?: PlanSourceKindLabel) {
  if (value === 'manual_summary') return 'ใช้ข้อความที่คุณวางไว้';
  if (value === 'extracted') return 'ใช้ไฟล์ที่แนบไว้';
  if (value === 'retrieved') return 'ใช้บริบทในห้องนี้';
  return 'บริบทในห้องนี้';
}

export function formatGeneratedByLabel(value?: PlanGeneratedBy) {
  if (value === 'action') return 'แผนหลัก';
  if (value === 'scaffold') return 'ย่อยงาน';
  if (value === 'rescue') return 'ช่วยตอนติด';
  if (value === 'reentry') return 'กลับเข้าห้อง';
  return value ?? '';
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return undefined;
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function buildStepEvidenceDisplay(step?: CurrentPlanStep, selectedSourceId?: string | null) {
  if (!step) {
    return {
      evidence: [],
      selectedEvidence: undefined,
      hasRetrievedEvidence: false,
      evidenceCount: 0,
      confidenceLabel: undefined,
      generatedLabel: undefined,
      confirmedLabel: undefined,
      sourceKindLabel: undefined,
      generatedByLabel: undefined,
    };
  }

  const evidence = step.evidence ?? [];
  const selectedEvidence = evidence.find((item) => item.sourceId === selectedSourceId) ?? evidence[0];

  return {
    evidence,
    selectedEvidence,
    hasRetrievedEvidence: hasRetrievedEvidence(step),
    evidenceCount: evidence.length,
    confidenceLabel: step.confidence ? formatConfidenceLabel(step.confidence) : undefined,
    generatedLabel: formatTimestamp(step.provenance?.generatedAt),
    confirmedLabel: formatTimestamp(step.provenance?.confirmedAt),
    sourceKindLabel: formatSourceKindLabel(selectedEvidence?.sourceKindLabel),
    generatedByLabel: formatGeneratedByLabel(step.provenance?.generatedBy),
  };
}

export function buildStepEvidenceClickPayload(step: CurrentPlanStep, sourceId: string) {
  return {
    step_id: step.id,
    source_ids: [sourceId],
    confidence_level: step.confidence?.level,
    confidence_score: step.confidence?.score,
    destructive_risk: step.safety?.risk,
    retrieval_enabled: hasRetrievedEvidence(step),
  };
}
