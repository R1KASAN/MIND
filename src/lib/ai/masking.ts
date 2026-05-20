import type { TaskContext } from '@/lib/store/idb';

export type MaskedTaskContext = Partial<TaskContext>;

/**
 * Basic Regex rules for masking PII and sensitive data.
 * Note: สำหรับ production จริง อาจพิจารณาใช้ DLP API หรือ NER model ที่แม่นยำขึ้น
 */
export function applyMaskingRules(text: string): string {
  if (!text) return text;
  let masked = text;
  
  // 1. Email Redaction
  masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
  
  // 2. Phone Numbers (รองรับฟอร์แมตไทย)
  masked = masked.replace(/(?:0|\+66)[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/g, '[PHONE_REDACTED]');
  
  // 3. Thai National ID (เลขบัตร ปชช. 13 หลัก)
  masked = masked.replace(/\b[1-8]-?\d{4}-?\d{5}-?\d{2}-?\d{1}\b/g, '[ID_CARD_REDACTED]');
  
  // 4. Financial Amounts (หลักพันขึ้นไป หรือมีสกุลเงินกำกับ)
  masked = masked.replace(/(?:฿|THB|USD|\$|บาท|baht)\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/gi, '[AMOUNT_REDACTED]');
  
  // 5. Account/Credit Card Numbers (10-16 digits)
  masked = masked.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]');
  masked = masked.replace(/\b\d{3}[-\s]?\d{1}[-\s]?\d{5}[-\s]?\d{1}\b/g, '[ACCOUNT_REDACTED]');

  // 6. URLs ที่ไม่ใช่ localhost
  masked = masked.replace(/https?:\/\/(?!localhost)[^\s]+/g, '[URL_REDACTED]');

  return masked;
}

/**
 * Filter and mask TaskContext data before sending to external APIs.
 */
export function maskTaskContextForExternalLLM(raw: TaskContext): MaskedTaskContext {
  // 🔴 Dropped: id, createdAt, lastAttemptAt, sourceFiles raw blobs, etc.
  
  // 🟡 Masked fields
  const maskedSourceText = applyMaskingRules(raw.sourceText);
  const maskedExtractedText = raw.extractedText ? applyMaskingRules(raw.extractedText) : raw.extractedText;
  
  const maskedCurrentPlan = raw.currentPlan ? {
    ...raw.currentPlan,
    actionTitle: applyMaskingRules(raw.currentPlan.actionTitle),
    steps: raw.currentPlan.steps.map(step => ({
      ...step,
      text: applyMaskingRules(step.text)
    }))
  } : undefined;

  // 🟢 Pass-through fields
  return {
    workflowType: raw.workflowType,
    lifecycleState: raw.lifecycleState,
    currentStepIndex: raw.currentStepIndex,
    blockerSignals: raw.blockerSignals,
    rescueHistory: raw.rescueHistory,
    taskFrame: raw.taskFrame,
    taskShape: raw.taskShape,
    sourceText: maskedSourceText,
    extractedText: maskedExtractedText,
    currentPlan: maskedCurrentPlan,
    // Add dummy or stripped sourceFiles info just to know what files were present
    sourceFiles: raw.sourceFiles?.map(f => ({
      id: f.id,
      name: applyMaskingRules(f.name),
      kind: f.kind,
      status: f.status
    })) as any
  };
}
