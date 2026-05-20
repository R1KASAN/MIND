export type RoomFileKind = 'text' | 'pdf' | 'image' | 'table' | 'other';
export type RoomFileStatus = 'pending' | 'ready' | 'unreadable' | 'failed_extraction' | 'unsupported' | 'failed';
export type RoomFileFailureStage = 'pending' | 'pdf_text_layer' | 'pdf_ocr' | 'image_ocr' | 'text_read' | 'route' | 'unknown';
export type RoomFileUxState = 'pending' | 'ocr_failed' | 'ocr_garbled' | 'ready';
export type RoomSourcePreferenceSelectedBy = 'auto' | 'user';

export interface RoomFileOcrMetrics {
  rawTextLength: number;
  normalizedTextLength: number;
  fragmentedRunCount: number;
  spaceDensity: number;
  normalWordRatio: number;
  pageCountProcessed?: number;
  durationMs?: number;
}

export interface RoomFileUxCopy {
  state: RoomFileUxState;
  title: string;
  body: string;
  cta: string;
  detail: string;
  reasonLabel?: string;
}

export interface RoomSourceFile {
  id: string;
  name: string;
  kind: RoomFileKind;
  mimeType: string;
  size: number;
  status: RoomFileStatus;
  createdAt: number;
  extractedText?: string;
  failureReason?: string;
  failureDetail?: string;
  failureStage?: RoomFileFailureStage;
  storageKey?: string;
  lastExtractAttemptAt?: number;
  extractAttemptCount?: number;
  ocrEngine?: string;
  ocrMetrics?: RoomFileOcrMetrics;
}

export interface RoomSourcePreference {
  primarySourceId?: string;
  selectedAt?: number;
  selectedBy?: RoomSourcePreferenceSelectedBy;
}

export interface PreferredRoomSourceContext {
  sourceText: string;
  extractedText: string;
  primaryFile?: RoomSourceFile;
  readyFiles: RoomSourceFile[];
  needsPrimarySelection: boolean;
}

export interface RoomSubmission {
  text: string;
  sourceText: string;
  extractedText: string;
  sourceFiles: RoomSourceFile[];
}

export const ROOM_FILE_UX_COPY: Record<RoomFileUxState, RoomFileUxCopy> = {
  pending: {
    state: 'pending',
    title: 'กำลังสกัดข้อความ',
    body: 'ไฟล์ถูกแนบเข้าห้องแล้ว MIND กำลังอ่านข้อความอยู่เบื้องหลัง',
    cta: 'กำลังอ่านไฟล์',
    detail: 'PDF หรือรูปภาพอาจใช้เวลาสักครู่ ระหว่างนี้ห้องยังใช้ข้อความเดิมและไฟล์ที่อ่านได้ต่อไปก่อน',
    reasonLabel: 'กำลังสกัดข้อความจากไฟล์',
  },
  ocr_failed: {
    state: 'ocr_failed',
    title: 'อ่านไม่สำเร็จ',
    body: 'MIND ลองอ่านไฟล์นี้แล้ว แต่ยังดึงข้อความออกมาใช้ไม่ได้',
    cta: 'ลองอ่านไฟล์อีกครั้ง',
    detail: 'ปัญหานี้เกิดกับไฟล์นี้ไฟล์เดียว ห้องยังใช้ข้อความเดิมและไฟล์อื่นที่อ่านได้ต่อไป',
    reasonLabel: 'ลอง OCR แล้วแต่ยังอ่านข้อความไม่สำเร็จ',
  },
  ocr_garbled: {
    state: 'ocr_garbled',
    title: 'อ่านได้ไม่ชัดพอ',
    body: 'MIND อ่านได้บางส่วน แต่ข้อความยังแตกหรือไม่ครบ จึงยังไม่ใช้เป็นบริบทหลัก',
    cta: 'ลองอ่านไฟล์อีกครั้ง',
    detail: 'ไฟล์นี้อาจเป็นสแกนหรือภาพที่ตัวอักษรไม่ชัด ห้องยังใช้ข้อความเดิมและไฟล์อื่นที่อ่านได้ต่อไป',
    reasonLabel: 'ลอง OCR แล้วแต่ข้อความยังไม่ชัดพอ',
  },
  ready: {
    state: 'ready',
    title: 'อ่านไฟล์ได้แล้ว',
    body: 'MIND ดึงข้อความจากไฟล์นี้มาใช้เป็นบริบทของงานได้แล้ว',
    cta: 'ใช้บริบทนี้ต่อ',
    detail: 'ไฟล์นี้พร้อมใช้ร่วมกับข้อความเดิมของห้อง',
  },
};

export function getRoomFileUxCopy(fileOrReason?: Pick<RoomSourceFile, 'status' | 'failureReason'> | string): RoomFileUxCopy {
  const failureReason = typeof fileOrReason === 'string' ? fileOrReason : fileOrReason?.failureReason;
  const status = typeof fileOrReason === 'object' && fileOrReason ? fileOrReason.status : undefined;

  if (status === 'ready') return ROOM_FILE_UX_COPY.ready;
  if (status === 'pending') return ROOM_FILE_UX_COPY.pending;
  if (status === 'unreadable') return ROOM_FILE_UX_COPY.ocr_garbled;
  if (status === 'failed_extraction') return ROOM_FILE_UX_COPY.ocr_failed;

  switch (failureReason) {
    case 'pdf_text_garbled_after_ocr':
    case 'pdf_text_layer_garbled':
      return ROOM_FILE_UX_COPY.ocr_garbled;
    case 'pdf_ocr_failed':
    case 'image_ocr_failed':
    case 'file_extraction_unavailable':
    case 'text_read_failed':
    case 'extract_failed':
    case 'unsupported_file_type':
      return ROOM_FILE_UX_COPY.ocr_failed;
    default:
      return ROOM_FILE_UX_COPY.ocr_failed;
  }
}

export function describeRoomFileFailureReason(failureReason?: string): string | undefined {
  if (!failureReason) return undefined;
  switch (failureReason) {
    case 'unsupported_file_type':
      return 'ชนิดไฟล์นี้ยังไม่รองรับ';
    case 'file_extraction_unavailable':
      return 'ยังอ่านไฟล์นี้ไม่ได้';
    case 'text_read_failed':
      return 'ยังอ่านข้อความจากไฟล์นี้ไม่ได้';
    case 'extract_failed':
      return 'อ่านไฟล์นี้ไม่สำเร็จ';
  }
  const copy = getRoomFileUxCopy(failureReason);
  return copy.reasonLabel ?? copy.title;
}

function normalizeRoomFileStatus(status: unknown, failureReason?: string): RoomFileStatus {
  if (
    status === 'pending' ||
    status === 'ready' ||
    status === 'unreadable' ||
    status === 'failed_extraction' ||
    status === 'unsupported'
  ) {
    return status;
  }

  if (status === 'failed') {
    return failureReason === 'pdf_text_garbled_after_ocr' || failureReason === 'pdf_text_layer_garbled'
      ? 'unreadable'
      : 'failed_extraction';
  }

  if (failureReason) {
    return failureReason === 'pdf_text_garbled_after_ocr' || failureReason === 'pdf_text_layer_garbled'
      ? 'unreadable'
      : 'failed_extraction';
  }

  return 'ready';
}

export function inferRoomFileKind(name: string, mimeType: string): RoomFileKind {
  const lowerName = name.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  const isTableLike =
    lowerMime.includes('csv') ||
    lowerMime.includes('tab-separated-values') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.tsv');

  if (lowerMime.startsWith('image/')) return 'image';
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (isTableLike) return 'table';
  if (
    lowerMime.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.yaml') ||
    lowerName.endsWith('.yml')
  ) {
    return 'text';
  }

  return 'other';
}

export function normalizeRoomFileText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncateRoomText(text: string, limit = 8000): string {
  const normalized = text.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}\n\n[ตัดข้อความบางส่วนเพื่อคงความเร็วของงาน]`;
}

export function summarizeRoomFile(file: RoomSourceFile): string {
  const statusLabel =
    file.status === 'ready'
      ? 'ready'
      : file.status === 'pending'
        ? 'pending'
        : file.status === 'unreadable'
          ? 'unreadable'
          : file.status === 'failed_extraction' || file.status === 'failed'
            ? 'failed_extraction'
            : 'unsupported';
  const parts = [
    file.name,
    file.kind,
    file.mimeType || 'unknown',
    `${Math.round(file.size / 1024)} KB`,
    `status=${statusLabel}`,
  ];
  if (file.failureReason) {
    parts.push(`reason=${file.failureReason}`);
  }
  if (file.failureStage) {
    parts.push(`stage=${file.failureStage}`);
  }
  if (file.ocrEngine) {
    parts.push(`ocr=${file.ocrEngine}`);
  }
  return parts.join(' · ');
}

function normalizeRoomFileOcrMetrics(value: unknown): RoomFileOcrMetrics | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const rawTextLength = typeof record.rawTextLength === 'number' && Number.isFinite(record.rawTextLength)
    ? Math.max(0, Math.floor(record.rawTextLength))
    : undefined;
  const normalizedTextLength = typeof record.normalizedTextLength === 'number' && Number.isFinite(record.normalizedTextLength)
    ? Math.max(0, Math.floor(record.normalizedTextLength))
    : undefined;
  const fragmentedRunCount = typeof record.fragmentedRunCount === 'number' && Number.isFinite(record.fragmentedRunCount)
    ? Math.max(0, Math.floor(record.fragmentedRunCount))
    : undefined;
  const spaceDensity = typeof record.spaceDensity === 'number' && Number.isFinite(record.spaceDensity)
    ? Math.max(0, record.spaceDensity)
    : undefined;
  const normalWordRatio = typeof record.normalWordRatio === 'number' && Number.isFinite(record.normalWordRatio)
    ? Math.max(0, Math.min(1, record.normalWordRatio))
    : undefined;
  if (
    rawTextLength === undefined ||
    normalizedTextLength === undefined ||
    fragmentedRunCount === undefined ||
    spaceDensity === undefined ||
    normalWordRatio === undefined
  ) {
    return undefined;
  }
  const pageCountProcessed = typeof record.pageCountProcessed === 'number' && Number.isFinite(record.pageCountProcessed)
    ? Math.max(0, Math.floor(record.pageCountProcessed))
    : undefined;
  const durationMs = typeof record.durationMs === 'number' && Number.isFinite(record.durationMs)
    ? Math.max(0, Math.floor(record.durationMs))
    : undefined;
  return {
    rawTextLength,
    normalizedTextLength,
    fragmentedRunCount,
    spaceDensity,
    normalWordRatio,
    pageCountProcessed,
    durationMs,
  };
}

export function formatRoomSourceFileReference(file: RoomSourceFile): string {
  const failureLabel = describeRoomFileFailureReason(file.failureReason);
  if (failureLabel && file.status !== 'ready') {
    return `${file.name} (${file.kind}, ${failureLabel})`;
  }
  return `${file.name} (${file.kind})`;
}

export function normalizeRoomSourceFile(value: unknown): RoomSourceFile | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `${Date.now()}`;
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'untitled';
  const mimeType = typeof record.mimeType === 'string' && record.mimeType.trim() ? record.mimeType.trim() : 'application/octet-stream';
  const size = typeof record.size === 'number' && Number.isFinite(record.size) && record.size >= 0 ? record.size : 0;
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : Date.now();
  const extractedText = typeof record.extractedText === 'string' && record.extractedText.trim() ? record.extractedText.trim() : undefined;
  const failureReason = typeof record.failureReason === 'string' && record.failureReason.trim() ? record.failureReason.trim() : undefined;
  const failureDetail = typeof record.failureDetail === 'string' && record.failureDetail.trim() ? record.failureDetail.trim() : undefined;
  const failureStage =
    record.failureStage === 'pending' ||
    record.failureStage === 'pdf_text_layer' ||
    record.failureStage === 'pdf_ocr' ||
    record.failureStage === 'image_ocr' ||
    record.failureStage === 'text_read' ||
    record.failureStage === 'route' ||
    record.failureStage === 'unknown'
      ? record.failureStage
      : undefined;
  const storageKey = typeof record.storageKey === 'string' && record.storageKey.trim() ? record.storageKey.trim() : undefined;
  const lastExtractAttemptAt = typeof record.lastExtractAttemptAt === 'number' && Number.isFinite(record.lastExtractAttemptAt)
    ? record.lastExtractAttemptAt
    : undefined;
  const extractAttemptCount = typeof record.extractAttemptCount === 'number' && Number.isFinite(record.extractAttemptCount) && record.extractAttemptCount >= 0
    ? Math.floor(record.extractAttemptCount)
    : undefined;
  const ocrEngine = typeof record.ocrEngine === 'string' && record.ocrEngine.trim() ? record.ocrEngine.trim() : undefined;
  const ocrMetrics = normalizeRoomFileOcrMetrics(record.ocrMetrics);
  const inferredKind = inferRoomFileKind(name, mimeType);
  const kind =
    record.kind === 'text' ||
    record.kind === 'pdf' ||
    record.kind === 'image' ||
    record.kind === 'table' ||
    record.kind === 'other'
      ? record.kind
      : inferredKind;

  const status = normalizeRoomFileStatus(record.status, failureReason);

  return {
    id,
    name,
    kind,
    mimeType,
    size,
    status,
    createdAt,
    extractedText,
    failureReason,
    failureDetail,
    failureStage,
    storageKey,
    lastExtractAttemptAt,
    extractAttemptCount,
    ocrEngine,
    ocrMetrics,
  };
}

export function normalizeRoomSourceFiles(value: unknown): RoomSourceFile[] {
  if (!Array.isArray(value)) return [];
  const files: RoomSourceFile[] = [];
  for (const item of value) {
    const normalized = normalizeRoomSourceFile(item);
    if (normalized) files.push(normalized);
  }
  return files;
}

export function getRoomSourceIdForFile(fileIdOrFile: string | Pick<RoomSourceFile, 'id'>): string {
  const fileId = typeof fileIdOrFile === 'string' ? fileIdOrFile : fileIdOrFile.id;
  return `file:${fileId}`;
}

export function normalizeRoomSourcePreference(value: unknown): RoomSourcePreference | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const primarySourceId = typeof record.primarySourceId === 'string' && record.primarySourceId.trim()
    ? record.primarySourceId.trim()
    : undefined;
  if (!primarySourceId) return undefined;

  const selectedAt = typeof record.selectedAt === 'number' && Number.isFinite(record.selectedAt)
    ? record.selectedAt
    : undefined;
  const selectedBy = record.selectedBy === 'auto' || record.selectedBy === 'user'
    ? record.selectedBy
    : undefined;

  return {
    primarySourceId,
    selectedAt,
    selectedBy,
  };
}

export function getReadyRoomSourceFiles(sourceFiles: RoomSourceFile[]): RoomSourceFile[] {
  return sourceFiles.filter((file) => file.status === 'ready');
}

export function getPrimaryReadyRoomSourceFile(
  sourceFiles: RoomSourceFile[],
  sourcePreference?: RoomSourcePreference,
): RoomSourceFile | undefined {
  const readyFiles = getReadyRoomSourceFiles(sourceFiles);
  if (sourcePreference?.primarySourceId) {
    return readyFiles.find((file) => getRoomSourceIdForFile(file) === sourcePreference.primarySourceId);
  }
  if (readyFiles.length === 1) return readyFiles[0];
  return undefined;
}

export function createAutoRoomSourcePreference(
  sourceFiles: RoomSourceFile[],
  selectedAt = Date.now(),
): RoomSourcePreference | undefined {
  const readyFiles = getReadyRoomSourceFiles(sourceFiles);
  if (readyFiles.length !== 1) return undefined;
  return {
    primarySourceId: getRoomSourceIdForFile(readyFiles[0]),
    selectedAt,
    selectedBy: 'auto',
  };
}

export function composeRoomSourceText(text: string, extractedText: string, sourceFiles: RoomSourceFile[]): string {
  const sections: string[] = [];
  const normalizedText = text.trim();
  const normalizedExtracted = extractedText.trim();

  if (normalizedText) {
    sections.push(normalizedText);
  }

  if (normalizedExtracted) {
    sections.push(`บริบทจากไฟล์แนบ:\n${normalizedExtracted}`);
  } else if (sourceFiles.length > 0) {
    sections.push(
      `ไฟล์แนบ:\n${sourceFiles.map((file) => `- ${formatRoomSourceFileReference(file)}`).join('\n')}`,
    );
  }

  return sections.join('\n\n').trim();
}

export function buildPreferredRoomSourceContext(
  text: string,
  sourceFiles: RoomSourceFile[],
  sourcePreference?: RoomSourcePreference,
): PreferredRoomSourceContext {
  const baseText = stripRoomFileContext(text);
  const readyFiles = getReadyRoomSourceFiles(sourceFiles);
  const primaryFile = getPrimaryReadyRoomSourceFile(sourceFiles, sourcePreference);
  const extractedText = primaryFile?.extractedText?.trim() ?? '';
  const sourceText = composeRoomSourceText(baseText, extractedText, sourceFiles);

  return {
    sourceText,
    extractedText,
    primaryFile,
    readyFiles,
    needsPrimarySelection: readyFiles.length > 1 && !primaryFile,
  };
}

export function stripRoomFileContext(sourceText: string): string {
  const markers = [
    'บริบทจากไฟล์แนบ:\n',
    'ไฟล์แนบ:\n',
    '\n\nบริบทจากไฟล์แนบ:\n',
    '\n\nไฟล์แนบ:\n',
  ];

  for (const marker of markers) {
    const markerIndex = sourceText.indexOf(marker);
    if (markerIndex >= 0) return sourceText.slice(0, markerIndex).trim();
  }

  return sourceText.trim();
}

// ─── Room Context State Model ────────────────────────────────────────────────

export type RoomContextStatus = 'empty' | 'ready' | 'partial' | 'blocked';

/**
 * Returns the canonical context state for a Room task.
 *
 * - `empty`:   no usable context and no files at all
 * - `ready`:   usable context present, no failed files
 * - `partial`: usable context present + at least one failed/unreadable file
 * - `blocked`: files exist but all context paths are unusable
 *
 * Uses `stripRoomFileContext` so auto-generated file labels are not counted
 * as usable manual text.
 */
export function getRoomContextStatus(task: {
  sourceText: string;
  sourceFiles: Pick<RoomSourceFile, 'status'>[];
  lastSynthesis?: { situation_summary?: string | null } | null;
  taskFrame?: { objective?: string | null } | null;
}): RoomContextStatus {
  const strippedText = stripRoomFileContext(task.sourceText).trim();
  const readyFiles = task.sourceFiles.filter((f) => f.status === 'ready');
  const failedFiles = task.sourceFiles.filter(
    (f) => f.status === 'failed_extraction' || f.status === 'unreadable' || f.status === 'failed',
  );

  const hasUsableContext =
    strippedText.length > 0 ||
    readyFiles.length > 0 ||
    Boolean(task.lastSynthesis?.situation_summary) ||
    Boolean(task.taskFrame?.objective);

  if (!hasUsableContext && task.sourceFiles.length === 0) return 'empty';
  if (hasUsableContext && failedFiles.length === 0) return 'ready';
  if (hasUsableContext && failedFiles.length > 0) return 'partial';
  return 'blocked';
}
