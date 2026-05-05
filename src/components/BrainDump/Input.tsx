"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trackEvent } from '@/lib/instrumentation';
import {
  composeRoomSourceText,
  getRoomFileUxCopy,
  inferRoomFileKind,
  type RoomSubmission,
  type RoomSourceFile,
} from '@/lib/room';
import { createRoomFileStorageKey, saveRoomFileBlob } from '@/lib/store/idb';

interface Props {
  onNext: (dump: RoomSubmission) => void | Promise<void>;
  onFileExtractionComplete?: (dump: RoomSubmission) => void | Promise<void>;
  initialText?: string;
  studioPanel?: ReactNode;
  presentationMode?: boolean;
  defaultScenarioId?: DemoScenarioId;
  focusMode?: boolean;
  roomId?: string;
  disabled?: boolean;
  disabledReason?: string;
}

type DemoScenarioId = 'client_project_restart' | 'sales_inquiry_demo_request';

interface DemoScenario {
  id: DemoScenarioId;
  label: string;
  title: string;
  detail: string;
  value: string;
  eyebrow: string;
}

const FEATURED_SCENARIO: DemoScenario = {
  id: 'client_project_restart',
  label: 'Client project restart',
  title: 'งานลูกค้าค้าง แล้วต้องหาก้าวแรกใหม่',
  detail: 'เหมาะกับตอนที่งานหยุดไปหลายวันและต้องกลับเข้า context ให้เร็ว โดยไม่ต้องอ่านทุกอย่างใหม่ตั้งแต่ต้น',
  value: 'โปรเจกต์ลูกค้าค้างมาสองสัปดาห์ มี feedback กับข้อความเก่าอยู่หลายที่ ตอนนี้อยากรู้ว่างานอยู่ตรงไหนแล้ว และควรเริ่มจากอะไรให้กลับเข้าร่องได้เร็วที่สุด',
  eyebrow: 'ค่าเริ่มต้นของเดโม',
};

const ADVANCED_SCENARIO: DemoScenario = {
  id: 'sales_inquiry_demo_request',
  label: 'Sales inquiry / demo request',
  title: 'ข้อความลูกค้าหนัก ๆ แต่ต้องตอบให้ไว',
  detail: 'เหมาะกับตอนที่อยากสรุปดีล, ร่างคำตอบ, หรือหา next move ก่อนประชุมต่อ',
  value: 'ลูกค้าส่งข้อความถามเรื่อง demo และต้องการภาพรวมสั้น ๆ ว่าสัปดาห์นี้ควรโฟกัสดีลไหนก่อน แต่ข้อมูลกระจัดกระจายหลายช่องทาง',
  eyebrow: 'ตัวอย่างอื่น',
};

export function BrainDumpInput({
  onNext,
  onFileExtractionComplete,
  initialText,
  studioPanel,
  presentationMode = false,
  defaultScenarioId = 'client_project_restart',
  focusMode = true,
  roomId,
  disabled = false,
  disabledReason,
}: Props) {
  const [val, setVal] = useState(() => initialText ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showAdvancedScenario, setShowAdvancedScenario] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<DemoScenarioId>(
    defaultScenarioId === ADVANCED_SCENARIO.id ? ADVANCED_SCENARIO.id : FEATURED_SCENARIO.id,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submitLockRef = useRef(false);
  const selectedScenario: DemoScenario = activeScenarioId === ADVANCED_SCENARIO.id
    ? ADVANCED_SCENARIO
    : FEATURED_SCENARIO;

  const acceptedFileTypes = useMemo(
    () => 'application/pdf,image/*,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml',
    [],
  );

  useEffect(() => {
    if (!initialText) return;
    setVal((current) => (current.trim().length === 0 ? initialText : current));
  }, [initialText]);

  useEffect(() => {
    setActiveScenarioId(defaultScenarioId === ADVANCED_SCENARIO.id ? ADVANCED_SCENARIO.id : FEATURED_SCENARIO.id);
  }, [defaultScenarioId]);

  useEffect(() => {
    if (!presentationMode) return;
    setShowAdvancedScenario(false);
    setVal((current) => (current.trim().length === 0 ? selectedScenario.value : current));
  }, [presentationMode, selectedScenario.value]);

  const formatBytes = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatFileKind = (name: string, mimeType: string) => {
    const kind = inferRoomFileKind(name, mimeType);
    if (kind === 'pdf') return 'PDF';
    if (kind === 'image') return 'ภาพ';
    if (kind === 'table') return 'ตาราง';
    if (kind === 'text') return 'ข้อความ';
    return 'ไฟล์';
  };

  const pushFiles = (incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming);
    if (nextFiles.length === 0) return;
    setUploadError(null);
    setFiles((current) => [...current, ...nextFiles]);
  };

  const removeFileAt = (index: number) => {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const hasFiles = files.length > 0;
  const canSubmit = !disabled && !isSubmitting && (val.trim().length > 0 || hasFiles);

  const applyScenario = (scenario: DemoScenario) => {
    setActiveScenarioId(scenario.id);
    setVal(scenario.value);
    setShowAdvancedScenario(false);
  };

  const buildFallbackSubmission = (
    fileSnapshot: File[] = files,
    storageKeys: Array<string | undefined> = [],
    failureDetail?: string,
    pendingFiles: RoomSourceFile[] = [],
  ): RoomSubmission => {
    const now = Date.now();
    const sourceFiles: RoomSourceFile[] = fileSnapshot.map((file, index) => ({
      id: pendingFiles[index]?.id ?? `${now}-${file.name}`,
      name: file.name,
      kind: inferRoomFileKind(file.name, file.type),
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      status: 'failed_extraction',
      createdAt: now,
      failureReason: 'file_extraction_unavailable',
      failureDetail,
      failureStage: 'route',
      storageKey: storageKeys[index],
      lastExtractAttemptAt: now,
      extractAttemptCount: 1,
    }));
    const extractedText = '';
    const sourceText = composeRoomSourceText(val, extractedText, sourceFiles);
    return {
      text: val,
      sourceText,
      extractedText,
      sourceFiles,
    };
  };

  const buildPendingSubmission = (
    textSnapshot: string,
    fileSnapshot: File[],
    storageKeys: Array<string | undefined> = [],
  ): RoomSubmission => {
    const now = Date.now();
    const sourceFiles: RoomSourceFile[] = fileSnapshot.map((file, index) => ({
      id: `${now}-${index}-${file.name}`,
      name: file.name,
      kind: inferRoomFileKind(file.name, file.type),
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      status: 'pending',
      createdAt: now,
      failureReason: 'file_extraction_pending',
      failureStage: 'pending',
      storageKey: storageKeys[index],
      lastExtractAttemptAt: now,
      extractAttemptCount: 0,
    }));
    return {
      text: textSnapshot,
      sourceText: composeRoomSourceText(textSnapshot, '', sourceFiles),
      extractedText: '',
      sourceFiles,
    };
  };

  const buildExtractionWarning = (sourceFiles: RoomSourceFile[]) => {
    const failedFiles = sourceFiles.filter((file) => file.status !== 'ready');
    if (failedFiles.length === 0) return null;
    if (failedFiles.length === 1) {
      const file = failedFiles[0];
      const copy = getRoomFileUxCopy(file);
      return `แนบ ${file.name} แล้ว แต่ ${copy.body} จะใช้ข้อความที่พิมพ์หรือบริบทที่ยังอ่านได้ต่อให้ก่อน`;
    }
    return 'มีบางไฟล์ที่ MIND อ่านได้ไม่ชัด จะใช้ข้อความที่พิมพ์หรือบริบทที่ยังอ่านได้ต่อให้ก่อน';
  };

  const trackSourceFileExtracts = (sourceFiles: RoomSourceFile[]) => {
    for (const file of sourceFiles) {
      trackEvent('ocr_extract_finished', {
        roomId,
        file_name: file.name,
        file_kind: file.kind,
        file_status: file.status,
        failure_reason: file.failureReason,
        ocr_engine: file.ocrEngine,
        raw_text_length: file.ocrMetrics?.rawTextLength,
        normalized_text_length: file.ocrMetrics?.normalizedTextLength,
        fragmented_run_count: file.ocrMetrics?.fragmentedRunCount,
        space_density: file.ocrMetrics?.spaceDensity,
        normal_word_ratio: file.ocrMetrics?.normalWordRatio,
        page_count_processed: file.ocrMetrics?.pageCountProcessed,
        duration_ms: file.ocrMetrics?.durationMs,
      });
    }
  };

  const saveFilesForRetry = async () => {
    const storageKeys = await Promise.all(files.map(async (file) => {
      const storageKey = createRoomFileStorageKey(file, roomId);
      try {
        return await saveRoomFileBlob(file, storageKey);
      } catch (error) {
        console.warn('[MIND] failed to save room file blob for retry', error);
        return undefined;
      }
    }));
    return storageKeys;
  };

  const attachRetryMetadata = (
    fileSnapshot: File[],
    extractedFiles: unknown[],
    storageKeys: Array<string | undefined>,
    pendingFiles: RoomSourceFile[] = [],
  ): RoomSourceFile[] => {
    const now = Date.now();
    return fileSnapshot.map((file, index) => {
      const extracted = extractedFiles[index] as Partial<RoomSourceFile> | undefined;
      const pending = pendingFiles[index];
      const failureReason = extracted?.failureReason;
      const extractedStatus = extracted?.status === 'failed'
        ? failureReason === 'pdf_text_garbled_after_ocr' || failureReason === 'pdf_text_layer_garbled'
          ? 'unreadable'
          : 'failed_extraction'
        : extracted?.status;
      return {
        id: pending?.id || extracted?.id || `${now}-${file.name}`,
        name: extracted?.name || file.name,
        kind: extracted?.kind || inferRoomFileKind(file.name, file.type),
        mimeType: extracted?.mimeType || file.type || 'application/octet-stream',
        size: typeof extracted?.size === 'number' ? extracted.size : file.size,
        status: extractedStatus || 'failed_extraction',
        createdAt: typeof extracted?.createdAt === 'number' ? extracted.createdAt : now,
        extractedText: extracted?.extractedText,
        failureReason,
        failureDetail: extracted?.failureDetail,
        failureStage: extracted?.failureStage,
        storageKey: extracted?.storageKey || pending?.storageKey || storageKeys[index],
        lastExtractAttemptAt: extracted?.lastExtractAttemptAt ?? now,
        extractAttemptCount: extracted?.extractAttemptCount ?? 1,
        ocrEngine: extracted?.ocrEngine,
        ocrMetrics: extracted?.ocrMetrics,
      };
    });
  };

  const runBackgroundExtraction = async (
    textSnapshot: string,
    fileSnapshot: File[],
    pendingFiles: RoomSourceFile[],
    storageKeys: Array<string | undefined>,
  ) => {
    try {
      const formData = new FormData();
      formData.append('text', textSnapshot);
      fileSnapshot.forEach((file) => formData.append('files', file, file.name));

      const response = await fetch('/api/file-room/extract', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message || `extract_failed_${response.status}`);
      }

      const sourceFiles = attachRetryMetadata(
        fileSnapshot,
        Array.isArray(data.sourceFiles) ? data.sourceFiles : [],
        storageKeys,
        pendingFiles,
      );
      const extractedText = sourceFiles
        .map((file) => file.status === 'ready' ? file.extractedText?.trim() : undefined)
        .filter((value): value is string => Boolean(value))
        .join('\n\n');
      const submission: RoomSubmission = {
        text: typeof data.text === 'string' ? data.text : textSnapshot,
        sourceText: composeRoomSourceText(textSnapshot, extractedText, sourceFiles),
        extractedText,
        sourceFiles,
      };
      trackSourceFileExtracts(submission.sourceFiles);
      setUploadError(buildExtractionWarning(submission.sourceFiles));
      await onFileExtractionComplete?.(submission);
    } catch (error) {
      const failureDetail = error instanceof Error ? error.message : 'extract_request_failed';
      const fallbackSubmission = buildFallbackSubmission(fileSnapshot, storageKeys, failureDetail, pendingFiles);
      setUploadError('ไฟล์แนบยังสกัดไม่ได้ MIND จะใช้ข้อความที่มีอยู่ต่อให้ก่อน');
      trackSourceFileExtracts(fallbackSubmission.sourceFiles);
      await onFileExtractionComplete?.(fallbackSubmission);
    }
  };

  const submit = async () => {
    if (disabled || submitLockRef.current || isSubmitting || (!val.trim() && files.length === 0)) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    setUploadError(null);
    let savedStorageKeys: Array<string | undefined> = [];

    try {
      let submission: RoomSubmission;
      const textSnapshot = val;
      const fileSnapshot = [...files];

      if (fileSnapshot.length > 0) {
        savedStorageKeys = await saveFilesForRetry();
        submission = buildPendingSubmission(textSnapshot, fileSnapshot, savedStorageKeys);
        setUploadError(buildExtractionWarning(submission.sourceFiles));
      } else {
        submission = {
          text: textSnapshot,
          sourceText: textSnapshot.trim(),
          extractedText: '',
          sourceFiles: [],
        };
        setUploadError(null);
      }

      trackEvent('dump_submitted');
      await onNext(submission);
      setVal('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (fileSnapshot.length > 0) {
        void runBackgroundExtraction(textSnapshot, fileSnapshot, submission.sourceFiles, savedStorageKeys);
      }
    } catch (error) {
      const failureDetail = error instanceof Error ? error.message : 'extract_request_failed';
      const fallbackSubmission = buildFallbackSubmission(files, savedStorageKeys, failureDetail);
      setUploadError('ไฟล์แนบยังสกัดไม่ได้ MIND จะใช้ข้อความที่มีอยู่ต่อให้ก่อน');
      trackSourceFileExtracts(fallbackSubmission.sourceFiles);
      trackEvent('dump_submitted');
      await onNext(fallbackSubmission);
      setVal('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="dump-stage-layout"
      style={{
        gap: 'clamp(0.8rem, 2.2vw, 1.15rem)',
        paddingTop: 'clamp(0.85rem, 3vw, 1.5rem)',
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDraggingFiles(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setIsDraggingFiles(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDraggingFiles(false);
        if (event.dataTransfer.files.length > 0) {
          pushFiles(event.dataTransfer.files);
        }
      }}
    >
      <div className="dump-stage-main">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            {presentationMode ? '30-second story' : 'เริ่มงานนี้'}
          </p>
          <h1 style={{ fontSize: '2rem', fontWeight: 650, lineHeight: 1.08 }}>
            พิมพ์งานก่อน แล้วค่อยแนบไฟล์ถ้ามี
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '36rem' }}>
            พิมพ์สิ่งที่ค้างอยู่ตรง ๆ แล้วกดไปต่อได้เลย ถ้ามีไฟล์ค่อยแนบเพิ่มทีหลัง
          </p>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem',
          padding: 'clamp(0.8rem, 2.8vw, 1rem)',
          borderRadius: '22px',
          border: isDraggingFiles ? '1px solid rgba(112, 125, 255, 0.55)' : '1px solid rgba(255,255,255,0.1)',
          background: isDraggingFiles
            ? 'linear-gradient(180deg, rgba(107,114,255,0.12), rgba(255,255,255,0.04))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))',
          boxShadow: isDraggingFiles ? '0 0 0 1px rgba(112,125,255,0.12), 0 28px 90px rgba(50,60,160,0.18)' : 'none',
          transition: 'border-color 140ms ease, background 140ms ease, box-shadow 140ms ease',
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>วางงานตรงนี้ก่อน</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              ไฟล์เป็นบริบทเสริม ไม่จำเป็นต้องมีตั้งแต่รอบแรก
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            แนบไฟล์เพิ่ม
          </button>
        </div>

        <input
          ref={fileInputRef}
          id="brain-dump-files"
          name="brainDumpFiles"
          type="file"
          multiple
          accept={acceptedFileTypes}
          style={{ display: 'none' }}
          onChange={(event) => {
            if (event.target.files) pushFiles(event.target.files);
            event.currentTarget.value = '';
          }}
          disabled={disabled}
        />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          color: 'var(--text-secondary)',
          fontSize: '0.84rem',
        }}>
          <span>ลากไฟล์มาวางในกล่องนี้ได้ ถ้าต้องใช้</span>
          <span>{hasFiles ? `${files.length} ไฟล์พร้อมใช้` : 'ไฟล์เป็นบริบทเสริมเท่านั้น'}</span>
        </div>

        <textarea
          id="brain-dump-text"
          name="brainDumpText"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="พิมพ์สภาพงานตอนนี้ตรง ๆ ได้เลย เช่น ลูกค้าส่ง feedback มา / งานค้างไปหลายวัน / รอไฟล์จากลูกค้า..."
          aria-label="พิมพ์สภาพงานของคุณ"
          style={{
            flex: 1,
            minHeight: 'clamp(180px, 30vh, 260px)',
            borderRadius: '18px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(13,13,18,0.42)',
            padding: '1rem 1.05rem',
          }}
          autoFocus
          disabled={disabled || isSubmitting}
        />

        {hasFiles && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {files.map((file, index) => (
              <div
                key={`${file.name}-${file.lastModified}-${index}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.7rem 0.85rem',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    {formatFileKind(file.name, file.type)} · {formatBytes(file.size)}
                  </span>
                </div>
                <button type="button" onClick={() => removeFileAt(index)} disabled={disabled}>
                  ลบ
                </button>
              </div>
            ))}
          </div>
        )}

        {uploadError && (
          <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem' }}>
            {uploadError}
          </p>
        )}
        </div>

        <button className="primary" onClick={submit} disabled={!canSubmit} style={{ width: '100%' }}>
          {disabled ? disabledReason ?? 'ใช้งานไม่ได้ชั่วคราว' : isSubmitting ? 'กำลังสรุป...' : 'ไปต่อ'}
        </button>

        <details
          open={showAdvancedScenario}
          onToggle={(event) => setShowAdvancedScenario(event.currentTarget.open)}
          style={{
            padding: '0.95rem 1rem',
            borderRadius: '18px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <summary style={{
            cursor: 'pointer',
            listStyle: 'none',
            color: 'var(--text-secondary)',
            fontSize: '0.84rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}>
            ดูตัวอย่างและวิธีใช้เร็ว
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.85rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {selectedScenario.eyebrow}
              </p>
              <strong style={{ fontSize: '0.98rem' }}>{selectedScenario.title}</strong>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                {selectedScenario.detail}
              </p>
              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={() => applyScenario(selectedScenario)} style={{ alignSelf: 'flex-start' }}>
                  ใช้ตัวอย่างนี้
                </button>
                <button type="button" onClick={() => applyScenario(ADVANCED_SCENARIO)} style={{ alignSelf: 'flex-start' }}>
                  ใช้ตัวอย่างอีกแบบ
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.94rem' }}>เริ่มเร็วที่สุด</p>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                1. วางสิ่งที่ค้างอยู่ 2. แนบไฟล์ถ้ามี 3. กดไปต่อ
              </p>
            </div>
          </div>
        </details>
      </div>

      {studioPanel && (
        focusMode ? (
          <details
            style={{
              marginTop: '0.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                listStyle: 'none',
                color: 'var(--text-secondary)',
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
            >
              ดูบริบทเสริม
            </summary>
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55, maxWidth: '42rem' }}>
                ภาพรวม, คลังเก็บ, และความไว้ใจจะเปิดเมื่อคุณต้องการดูบริบทลึกขึ้น
              </p>
              {studioPanel}
            </div>
          </details>
        ) : (
          <section style={{
            marginTop: '0.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55, maxWidth: '42rem' }}>
              ภาพรวม, คลังเก็บ, และความไว้ใจเป็นตัวช่วยเสริมสำหรับตอนที่อยากดูบริบทลึกขึ้น ไม่จำเป็นต้องเปิดก่อน
            </p>
            {studioPanel}
          </section>
        )
      )}
    </div>
  );
}
