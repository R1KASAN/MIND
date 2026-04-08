export type RoomFileKind = 'text' | 'pdf' | 'image' | 'table' | 'other';
export type RoomFileStatus = 'ready' | 'failed' | 'unsupported';

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
}

export interface RoomSubmission {
  text: string;
  sourceText: string;
  extractedText: string;
  sourceFiles: RoomSourceFile[];
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

export function truncateRoomText(text: string, limit = 8000): string {
  const normalized = text.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}\n\n[ตัดข้อความบางส่วนเพื่อคงความเร็วของงาน]`;
}

export function summarizeRoomFile(file: RoomSourceFile): string {
  const statusLabel =
    file.status === 'ready'
      ? 'ready'
      : file.status === 'failed'
        ? 'failed'
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
  return parts.join(' · ');
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
  const inferredKind = inferRoomFileKind(name, mimeType);
  const kind =
    record.kind === 'text' ||
    record.kind === 'pdf' ||
    record.kind === 'image' ||
    record.kind === 'table' ||
    record.kind === 'other'
      ? record.kind
      : inferredKind;

  const status =
    record.status === 'ready' ||
    record.status === 'failed' ||
    record.status === 'unsupported'
      ? record.status
      : failureReason
        ? 'failed'
        : 'ready';

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
      `ไฟล์แนบ:\n${sourceFiles.map((file) => `- ${file.name} (${file.kind})`).join('\n')}`,
    );
  }

  return sections.join('\n\n').trim();
}
