import type { AiActionNegotiationMode } from '@/lib/ai/operations';
import {
  buildRoomDataSources,
  createMetadataRetrievalEngine,
  type RoomDataSource,
} from '@/lib/retrieval/room-data';
import { buildRoomDataSourcesWithMemory } from '@/lib/retrieval/room-memory-sources';
import type { PlanEvidenceChip, TaskContext } from '@/lib/store/idb';

export type ActionEvidenceSelectionMethod = 'retrieval' | 'none';

export interface ActionEvidenceContext {
  summaryText: string;
  evidenceChips: PlanEvidenceChip[];
  selectionMethod: ActionEvidenceSelectionMethod;
}

export interface ActionEvidenceCandidate {
  title: string;
  rationale: string;
  kind?: string;
}

export interface ActionEvidenceNegotiation {
  mode: AiActionNegotiationMode;
  userNote?: string;
}

const MAX_EVIDENCE_ITEMS = 3;
const MAX_EVIDENCE_LINE_CHARS = 180;
const MAX_EVIDENCE_EXCERPT_CHARS = 140;
const FAILURE_COPY_PATTERNS = [
  /ยังไม่มีข้อความที่อ่านได้จากไฟล์นี้/i,
  /ยังอ่านไฟล์นี้ไม่ได้/i,
  /\bocr\b/i,
  /\bfailed\b/i,
  /\bunreadable\b/i,
];

function compactText(value: string | undefined, limit: number) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function hasMeaningfulText(value: string) {
  const meaningfulChars = value.replace(/[^\p{L}\p{N}]/gu, '');
  return meaningfulChars.length >= 12;
}

function chooseExcerpt(source: RoomDataSource) {
  for (const value of [source.excerpt, source.summary, source.extractedText, source.rawText]) {
    const normalized = compactText(value, MAX_EVIDENCE_EXCERPT_CHARS);
    if (!normalized) continue;
    if (!hasMeaningfulText(normalized)) continue;
    if (FAILURE_COPY_PATTERNS.some((pattern) => pattern.test(normalized))) continue;
    return normalized;
  }
  return '';
}

function buildEvidenceLine(source: RoomDataSource, excerpt: string) {
  return compactText(`[${source.id}] ${source.title}: ${excerpt}`, MAX_EVIDENCE_LINE_CHARS);
}

function toEvidenceChip(source: RoomDataSource, excerpt: string): PlanEvidenceChip {
  return {
    sourceId: source.id,
    label: source.label || source.title,
    excerpt,
    sourceKindLabel: 'retrieved',
  };
}

async function buildActionEvidenceSources(task: TaskContext) {
  try {
    return await buildRoomDataSourcesWithMemory(task, { refLimit: 5 });
  } catch {
    return buildRoomDataSources(task);
  }
}

export function buildActionEvidenceQuery(input: {
  task: TaskContext;
  preferredCandidate?: ActionEvidenceCandidate | null;
  negotiation?: ActionEvidenceNegotiation | null;
}) {
  const { task, preferredCandidate, negotiation } = input;
  return [
    preferredCandidate?.title,
    preferredCandidate?.title,
    task.currentPlan?.actionTitle,
    task.taskFrame?.objective,
    task.blockerSignals.join(' '),
    task.blockerSignals.join(' '),
    task.taskShape?.immediateNeed,
    preferredCandidate?.rationale,
    negotiation?.userNote,
  ].filter((value): value is string => Boolean(value?.trim())).join(' ');
}

export async function buildActionEvidenceContext(input: {
  task: TaskContext;
  preferredCandidate?: ActionEvidenceCandidate | null;
  negotiation?: ActionEvidenceNegotiation | null;
}): Promise<ActionEvidenceContext> {
  const roomId = input.task.roomId ?? input.task.id;
  const query = buildActionEvidenceQuery(input);
  if (!query.trim()) {
    return { summaryText: '', evidenceChips: [], selectionMethod: 'none' };
  }

  const sources = (await buildActionEvidenceSources(input.task))
    .filter((source) => source.status === 'ready')
    .map((source) => ({ source, excerpt: chooseExcerpt(source) }))
    .filter((item) => Boolean(item.excerpt));

  if (sources.length === 0) {
    return { summaryText: '', evidenceChips: [], selectionMethod: 'none' };
  }

  const sourceById = new Map(sources.map((item) => [item.source.id, item]));
  const retrievalEngine = await createMetadataRetrievalEngine(sources.map((item) => item.source));
  const hits = await retrievalEngine.retrieveHits(query, roomId, MAX_EVIDENCE_ITEMS);
  const selected = hits
    .map((hit) => sourceById.get(hit.item.id))
    .filter((item): item is { source: RoomDataSource; excerpt: string } => Boolean(item))
    .slice(0, MAX_EVIDENCE_ITEMS);

  if (selected.length === 0) {
    return { summaryText: '', evidenceChips: [], selectionMethod: 'none' };
  }

  return {
    summaryText: selected.map((item) => buildEvidenceLine(item.source, item.excerpt)).join('\n'),
    evidenceChips: selected.map((item) => toEvidenceChip(item.source, item.excerpt)),
    selectionMethod: 'retrieval',
  };
}
