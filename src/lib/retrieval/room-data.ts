import type { PendingInput, TaskContext } from '@/lib/store/idb';
import { describeRoomFileFailureReason, stripRoomFileContext, type RoomSourceFile } from '@/lib/room';
import { MiniSearchRetrievalEngine, shouldUseRicherRetrieval, type RetrievalSourceItem } from '@/lib/retrieval/engine';
import type { RoomMemoryRefStatus } from '@/lib/store/room-memory-db';

export type RoomDataSourceType = 'text' | 'file' | 'clarification' | 'manual_rescue' | 'memory_ref';
export type RoomDataSourceStatus =
  | 'ready'
  | 'pending'
  | 'unreadable'
  | 'failed_extraction'
  | 'failed'
  | 'unsupported'
  | 'tombstone'
  | 'missing';

export interface RoomDataSource extends RetrievalSourceItem {
  type: RoomDataSourceType;
  title: string;
  status: RoomDataSourceStatus;
  label: string;
  excerpt: string;
  usedInPlanCount: number;
  lastUsedAt?: number;
  unusedDays: number | null;
  sensitiveFlags: string[];
  storageKey?: string;
  deleteToken: string;
  deletable?: boolean;
  refStatus?: RoomMemoryRefStatus;
}

export interface RoomDataSearchInput {
  sources: RoomDataSource[];
  roomId: string;
  query: string;
  k?: number;
  type?: RoomDataSourceType | 'all';
  status?: RoomDataSourceStatus | 'all';
  sensitiveOnly?: boolean;
}

export interface RoomReviewAnswer {
  question: string;
  answer: string;
  sources: RoomDataSource[];
  retrievalEnabled: boolean;
}

const SENSITIVE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'contract', pattern: /\b(contract|agreement|scope of work|sow|สัญญา|ข้อตกลง)\b/i },
  { label: 'payment', pattern: /\b(payment|invoice|budget|deposit|fee|paid|ราคา|งบ|จ่าย|ใบแจ้งหนี้)\b/i },
  { label: 'deadline', pattern: /\b(deadline|due|timeline|launch|ส่งงาน|กำหนด|เดดไลน์)\b/i },
];

function compactText(value: string, limit = 220) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function formatShortDate(timestamp?: number) {
  if (!timestamp) return 'ไม่ระบุวัน';
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(new Date(timestamp));
}

function sourceTextForSensitiveScan(source: Pick<RoomDataSource, 'summary' | 'rawText' | 'extractedText' | 'excerpt'>) {
  return [source.summary, source.rawText, source.extractedText, source.excerpt].filter(Boolean).join('\n');
}

function detectSensitiveFlags(text: string) {
  return SENSITIVE_PATTERNS
    .filter((item) => item.pattern.test(text))
    .map((item) => item.label);
}

function usedCountForSource(task: TaskContext, sourceId: string) {
  const currentCount = task.currentPlan?.steps.filter((step) => (
    step.provenance?.sourceIds.includes(sourceId) ||
    step.evidence?.some((item) => item.sourceId === sourceId)
  )).length ?? 0;

  const historyCount = task.planHistory?.reduce((count, revision) => (
    count + revision.steps.filter((step) => (
      step.provenance?.sourceIds.includes(sourceId) ||
      step.evidence?.some((item) => item.sourceId === sourceId)
    )).length
  ), 0) ?? 0;

  return currentCount + historyCount;
}

function latestUseForSource(task: TaskContext, sourceId: string) {
  const stepTimes = [
    ...(task.currentPlan?.steps ?? []),
    ...(task.planHistory?.flatMap((revision) => revision.steps) ?? []),
  ]
    .filter((step) => (
      step.provenance?.sourceIds.includes(sourceId) ||
      step.evidence?.some((item) => item.sourceId === sourceId)
    ))
    .map((step) => step.provenance?.confirmedAt ?? step.provenance?.generatedAt)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return stepTimes.length > 0 ? Math.max(...stepTimes) : undefined;
}

function buildSourceBase(task: TaskContext, sourceId: string, createdAt: number | undefined, now: number) {
  const lastUsedAt = latestUseForSource(task, sourceId);
  const unusedDays = lastUsedAt
    ? Math.floor(Math.max(0, now - lastUsedAt) / 86400000)
    : null;

  return {
    roomId: task.roomId ?? task.id,
    createdAt,
    usedInPlanCount: usedCountForSource(task, sourceId),
    lastUsedAt,
    unusedDays,
  };
}

function sourceFromFile(task: TaskContext, file: RoomSourceFile, now: number): RoomDataSource {
  const sourceId = `file:${file.id}`;
  const readableStatus = file.status === 'ready' ? 'ready' : file.status;
  const failureLabel = describeRoomFileFailureReason(file.failureReason);
  const excerpt = compactText(file.extractedText || failureLabel || file.failureDetail || 'ยังไม่มีข้อความที่อ่านได้จากไฟล์นี้');
  const source: RoomDataSource = {
    ...buildSourceBase(task, sourceId, file.createdAt, now),
    id: sourceId,
    type: 'file',
    kind: file.kind,
    title: file.name,
    status: readableStatus,
    label: `${file.kind.toUpperCase()} · ${formatShortDate(file.createdAt)}`,
    summary: excerpt,
    rawText: '',
    extractedText: file.extractedText,
    originMeta: {
      fileName: file.name,
      mimeType: file.mimeType,
      size: file.size,
      failureReason: file.failureReason,
      failureStage: file.failureStage,
    },
    excerpt,
    sensitiveFlags: [],
    storageKey: file.storageKey,
    deleteToken: sourceId,
  };
  return { ...source, sensitiveFlags: detectSensitiveFlags(sourceTextForSensitiveScan(source)) };
}

function sourceFromPendingInput(task: TaskContext, item: PendingInput, index: number, now: number): RoomDataSource {
  const sourceId = `pending:${item.kind}:${index}`;
  const title = item.kind === 'clarification' ? 'Clarification answer' : 'Manual rescue note';
  const excerpt = compactText(item.answer);
  const source: RoomDataSource = {
    ...buildSourceBase(task, sourceId, item.createdAt, now),
    id: sourceId,
    type: item.kind,
    kind: item.kind,
    title,
    status: 'ready',
    label: `${item.kind === 'clarification' ? 'Clarification' : 'Manual rescue'} · ${formatShortDate(item.createdAt)}`,
    summary: excerpt,
    rawText: item.answer,
    originMeta: {
      prompt: item.prompt,
      kind: item.kind,
    },
    excerpt,
    sensitiveFlags: [],
    deleteToken: sourceId,
  };
  return { ...source, sensitiveFlags: detectSensitiveFlags(sourceTextForSensitiveScan(source)) };
}

export function buildRoomDataSources(task: TaskContext, now = Date.now()): RoomDataSource[] {
  const sources: RoomDataSource[] = [];
  const manualText = stripRoomFileContext(task.sourceText);
  if (manualText) {
    const sourceId = `manual:${task.id}`;
    const excerpt = compactText(manualText);
    const source: RoomDataSource = {
      ...buildSourceBase(task, sourceId, task.createdAt, now),
      id: sourceId,
      type: 'text',
      kind: 'manual_summary',
      title: 'Manual context',
      status: 'ready',
      label: `Manual summary · ${formatShortDate(task.createdAt)}`,
      summary: task.lastStableSummary ?? task.lastSynthesis?.situation_summary ?? excerpt,
      rawText: manualText,
      excerpt,
      sensitiveFlags: [],
      deleteToken: sourceId,
    };
    sources.push({ ...source, sensitiveFlags: detectSensitiveFlags(sourceTextForSensitiveScan(source)) });
  }

  for (const file of task.sourceFiles) {
    sources.push(sourceFromFile(task, file, now));
  }

  task.pendingInputs.forEach((item, index) => {
    sources.push(sourceFromPendingInput(task, item, index, now));
  });

  return sources;
}

function lexicalScore(source: RetrievalSourceItem, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  const haystack = [
    source.summary,
    source.rawText,
    source.extractedText,
    source.kind,
    JSON.stringify(source.originMeta ?? {}),
  ].join(' ').toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

export function searchRoomDataSources(input: RoomDataSearchInput): RoomDataSource[] {
  const {
    sources,
    roomId,
    query,
    k = sources.length,
    type = 'all',
    status = 'all',
    sensitiveOnly = false,
  } = input;

  const filtered = sources.filter((source) => (
    (!roomId || source.roomId === roomId) &&
    (type === 'all' || source.type === type) &&
    (status === 'all' || source.status === status) &&
    (!sensitiveOnly || source.sensitiveFlags.length > 0)
  ));

  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [...filtered]
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
      .slice(0, Math.max(0, k));
  }

  return filtered
    .map((source) => ({
      source,
      score: lexicalScore(source, normalizedQuery) + source.usedInPlanCount * 0.25 + (source.status === 'ready' ? 0.1 : 0),
    }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, k))
    .map((hit) => hit.source);
}

export async function createMetadataRetrievalEngine(sources: RoomDataSource[]) {
  const engine = new MiniSearchRetrievalEngine<RoomDataSource>();
  await Promise.all(sources.map((source) => engine.indexSourceItem(source)));
  return engine;
}

export function shouldUseRicherRoomRetrieval(task: TaskContext, sources: RoomDataSource[]) {
  const notLikeThisCount = task.stepFeedbackHistory?.filter((item) => item.kind === 'not_like_this').length ?? 0;
  const draftCount = Math.max(1, task.planHistory?.filter((item) => item.status === 'draft').length ?? 0);
  return shouldUseRicherRetrieval({
    sourceItemCount: sources.length,
    roomAgeMs: Date.now() - task.createdAt,
    notLikeThisRate: notLikeThisCount / draftCount,
  });
}

export function buildPreDeleteWarning(sources: RoomDataSource[]) {
  const sensitive = sources.filter((source) => source.sensitiveFlags.length > 0);
  const used = sources.filter((source) => source.usedInPlanCount > 0);
  if (sensitive.length === 0 && used.length === 0) return null;

  const sensitiveLabels = [...new Set(sensitive.flatMap((source) => source.sensitiveFlags))];
  return {
    level: sensitive.length > 0 ? 'high' as const : 'medium' as const,
    message: sensitive.length > 0
      ? `แหล่งข้อมูลที่เลือกมีเรื่อง ${sensitiveLabels.join(', ')} ตรวจอีกครั้งก่อนลบ`
      : 'แหล่งข้อมูลที่เลือกเคยถูกใช้ใน next move ก่อนหน้า',
    sensitiveCount: sensitive.length,
    usedCount: used.length,
  };
}

export function answerRoomReviewQuestion(
  question: string,
  sources: RoomDataSource[],
  roomId: string,
): RoomReviewAnswer {
  const results = searchRoomDataSources({ sources, roomId, query: question, k: 5 });
  const retrievalEnabled = shouldUseRicherRetrieval({
    sourceItemCount: sources.length,
    roomAgeMs: 0,
  });

  if (results.length === 0) {
    return {
      question,
      answer: 'ยังไม่เจอหลักฐานที่ตรงกับคำถามนี้ในห้องนี้ ลองถามด้วยคำที่อยู่ใน brief, email, หรือไฟล์แนบ',
      sources: [],
      retrievalEnabled,
    };
  }

  const lead = results[0];
  return {
    question,
    answer: `${lead.title}: ${lead.excerpt}`,
    sources: results,
    retrievalEnabled,
  };
}
