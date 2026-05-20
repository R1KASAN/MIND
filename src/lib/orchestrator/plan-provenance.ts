import type {
  CurrentPlan,
  CurrentPlanStep,
  DraftPlan,
  PlanConfidence,
  PlanEvidenceChip,
  PlanGeneratedBy,
  PlanSafety,
  StepFeedback,
  TaskContext,
} from '@/lib/store/idb';

const DESTRUCTIVE_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bsend\b/i,
  /\bpublish\b/i,
  /\barchive\b/i,
  /ลบ/,
  /ส่ง/,
  /เผยแพร่/,
  /แก้ในระบบจริง/,
];

function truncate(value: string, max = 140) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function sourceLabelFromFileName(name: string) {
  if (name.length <= 22) return name;
  const dotIndex = name.lastIndexOf('.');
  const extension = dotIndex > 0 ? name.slice(dotIndex) : '';
  return `${name.slice(0, 18)}…${extension}`;
}

export function buildPlanEvidence(task: TaskContext, max = 3): PlanEvidenceChip[] {
  const fileEvidence = task.sourceFiles
    .slice(0, max)
    .map<PlanEvidenceChip>((file) => ({
      sourceId: file.id,
      label: file.status === 'ready'
        ? `ดึงจาก ${sourceLabelFromFileName(file.name)}`
        : sourceLabelFromFileName(file.name),
      excerpt: file.extractedText ? truncate(file.extractedText) : file.failureReason,
      sourceKindLabel: file.status === 'ready' ? 'extracted' : 'retrieved',
    }));

  if (fileEvidence.length > 0) return fileEvidence;
  if (!task.sourceText.trim()) return [];

  return [{
    sourceId: `manual:${task.id}`,
    label: 'ใช้ข้อความที่คุณวางไว้',
    excerpt: truncate(task.sourceText),
    sourceKindLabel: 'manual_summary',
  }];
}

export function inferPlanConfidence(task: TaskContext, evidence: PlanEvidenceChip[]): PlanConfidence {
  const supportingSourceCount = evidence.length;
  const hasConfirmedHistory = (task.planHistory ?? []).some((revision) => revision.status === 'confirmed');

  if (supportingSourceCount >= 3 || (supportingSourceCount >= 2 && hasConfirmedHistory)) {
    return {
      level: 'high',
      score: 0.84,
      rationale: `High confidence — grounded in ${supportingSourceCount} sources in this room`,
      supportingSourceCount,
    };
  }

  if (supportingSourceCount >= 2) {
    return {
      level: 'medium',
      score: 0.66,
      rationale: 'Medium confidence — grounded in 2 sources',
      supportingSourceCount,
    };
  }

  return {
    level: 'low',
    score: 0.42,
    rationale: 'First guess — please review before acting',
    supportingSourceCount,
  };
}

export function inferStepSafety(text: string): PlanSafety {
  const destructive = DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(text));
  return {
    destructive,
    risk: destructive ? 'medium' : 'none',
    manualOnly: destructive,
  };
}

export function enrichStepWithProvenance(
  step: CurrentPlanStep,
  task: TaskContext,
  generatedBy: PlanGeneratedBy,
  generatedAt = Date.now(),
): CurrentPlanStep {
  const evidence = step.evidence && step.evidence.length > 0 ? step.evidence : buildPlanEvidence(task);
  const confidence = step.confidence ?? inferPlanConfidence(task, evidence);
  const safety = step.safety ?? inferStepSafety(step.text);
  const sourceIds = evidence.map((item) => item.sourceId);

  return {
    ...step,
    evidence,
    confidence,
    safety,
    provenance: {
      generatedAt,
      generatedBy,
      sourceIds,
      ...step.provenance,
    },
  };
}

export function enrichPlanWithProvenance(
  plan: CurrentPlan,
  task: TaskContext,
  generatedBy: PlanGeneratedBy,
  generatedAt = Date.now(),
): CurrentPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => enrichStepWithProvenance(step, task, generatedBy, generatedAt)),
  };
}

export function createDraftPlanFromCurrentPlan(
  plan: CurrentPlan,
  generatedBy: PlanGeneratedBy,
  createdAt = Date.now(),
): DraftPlan {
  return {
    id: `draft-${createdAt}`,
    status: 'draft',
    actionTitle: plan.actionTitle,
    successSignal: plan.successSignal,
    steps: plan.steps,
    createdAt,
    generatedBy,
  };
}

export function createPlanRevision(
  plan: CurrentPlan,
  draftPlanId: string,
  status: 'draft' | 'confirmed' | 'rejected',
  createdAt = Date.now(),
) {
  return {
    id: `revision-${createdAt}`,
    planId: draftPlanId,
    status,
    actionTitle: plan.actionTitle,
    steps: plan.steps,
    createdAt,
    confirmedAt: status === 'confirmed' ? createdAt : undefined,
  };
}

export function createStepFeedback(input: {
  stepId: string;
  draftPlanId?: string;
  kind: StepFeedback['kind'];
  note?: string;
  createdAt?: number;
}): StepFeedback {
  const createdAt = input.createdAt ?? Date.now();
  return {
    id: `feedback-${createdAt}`,
    stepId: input.stepId,
    draftPlanId: input.draftPlanId,
    kind: input.kind,
    note: input.note,
    createdAt,
  };
}

export function markPlanConfirmed(task: TaskContext, confirmedAt = Date.now()): TaskContext {
  if (!task.currentPlan) return { ...task, lastConfirmedActionAt: confirmedAt };
  const draftPlanId = task.pendingPlan?.id ?? `confirmed-${confirmedAt}`;
  const confirmedSteps = task.currentPlan.steps.map((step) => ({
    ...step,
    provenance: {
      generatedAt: step.provenance?.generatedAt ?? confirmedAt,
      generatedBy: step.provenance?.generatedBy ?? 'action',
      sourceIds: step.provenance?.sourceIds ?? step.evidence?.map((item) => item.sourceId) ?? [],
      ...step.provenance,
      confirmedAt,
    },
  }));
  const currentPlan = { ...task.currentPlan, steps: confirmedSteps };
  const confirmedStep = confirmedSteps[task.currentStepIndex] ?? confirmedSteps[0];

  return {
    ...task,
    currentPlan,
    pendingPlan: undefined,
    planHistory: [
      ...(task.planHistory ?? []),
      createPlanRevision(currentPlan, draftPlanId, 'confirmed', confirmedAt),
    ].slice(-20),
    stepFeedbackHistory: confirmedStep
      ? [
          ...(task.stepFeedbackHistory ?? []),
          createStepFeedback({
            stepId: confirmedStep.id,
            draftPlanId,
            kind: 'confirmed',
            createdAt: confirmedAt,
          }),
        ].slice(-50)
      : task.stepFeedbackHistory,
    lastConfirmedActionAt: confirmedAt,
  };
}

export function markCurrentStepNotLikeThis(task: TaskContext, note?: string, createdAt = Date.now()): TaskContext {
  const currentStep = task.currentPlan?.steps[task.currentStepIndex] ?? task.currentPlan?.steps[0];
  if (!currentStep) return task;
  return {
    ...task,
    stepFeedbackHistory: [
      ...(task.stepFeedbackHistory ?? []),
      createStepFeedback({
        stepId: currentStep.id,
        draftPlanId: task.pendingPlan?.id,
        kind: 'not_like_this',
        note,
        createdAt,
      }),
    ].slice(-50),
  };
}

export function markStepEdited(task: TaskContext, stepId: string, text: string, createdAt = Date.now()): TaskContext {
  if (!task.currentPlan) return task;
  const normalizedText = text.trim();
  if (!normalizedText) return task;
  const steps = task.currentPlan.steps.map((step) => {
    if (step.id !== stepId) return step;
    return {
      ...step,
      text: normalizedText,
      provenance: {
        generatedAt: step.provenance?.generatedAt ?? createdAt,
        generatedBy: step.provenance?.generatedBy ?? 'scaffold',
        sourceIds: step.provenance?.sourceIds ?? step.evidence?.map((item) => item.sourceId) ?? [],
        ...step.provenance,
        userEdited: true,
        overrideNote: 'Edited by you',
      },
    };
  });

  return {
    ...task,
    currentPlan: {
      ...task.currentPlan,
      steps,
    },
    stepFeedbackHistory: [
      ...(task.stepFeedbackHistory ?? []),
      createStepFeedback({
        stepId,
        draftPlanId: task.pendingPlan?.id,
        kind: 'edited',
        note: normalizedText,
        createdAt,
      }),
    ].slice(-50),
  };
}

export function formatConfidenceLabel(confidence?: PlanConfidence) {
  if (!confidence) return 'เดาแรก — ตรวจทานก่อนใช้';
  if (confidence.level === 'high') {
    return `มั่นใจสูง — อิงหลักฐาน ${confidence.supportingSourceCount} แหล่งในห้องนี้`;
  }
  if (confidence.level === 'medium') {
    return `มั่นใจกลาง — อิงหลักฐาน ${confidence.supportingSourceCount} แหล่ง`;
  }
  return 'เดาแรก — ตรวจทานก่อนใช้';
}
