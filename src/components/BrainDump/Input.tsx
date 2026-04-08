"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trackEvent } from '@/lib/instrumentation';
import {
  composeRoomSourceText,
  inferRoomFileKind,
  type RoomSubmission,
  type RoomSourceFile,
} from '@/lib/room';

interface Props {
  onNext: (dump: RoomSubmission) => void | Promise<void>;
  initialText?: string;
  studioPanel?: ReactNode;
}

const INPUT_STEPS = [
  {
    title: 'พิมพ์สภาพงานตรง ๆ',
    detail: 'ไม่มีไฟล์ก็เริ่มได้ แค่เล่าว่าตอนนี้อะไรค้างอยู่ หรือวางข้อความลูกค้ามา',
  },
  {
    title: 'ถ้ามีไฟล์ ค่อยแนบเพิ่ม',
    detail: 'PDF, screenshot, โน้ต และไฟล์ข้อความเป็น context เสริม ไม่ใช่เงื่อนไขเริ่มต้น',
  },
  {
    title: 'กดเอา next move ออกมา',
    detail: 'MIND จะสรุปสถานการณ์ ร่างคำตอบ และบอกก้าวแรกที่เริ่มได้ทันที',
  },
];

const INPUT_EXAMPLES = [
  {
    label: 'ตัวอย่าง: ตอบลูกค้า',
    value: 'ลูกค้าส่ง feedback ยาว 4 จุด บอกให้เปลี่ยน headline, ปรับ CTA และถามเรื่อง mobile layout แต่ผมยังไม่แน่ใจว่าควรตอบกลับยังไงก่อนดี',
  },
  {
    label: 'ตัวอย่าง: รีสตาร์ทงานค้าง',
    value: 'โปรเจกต์ลูกค้าค้างมาสองสัปดาห์ มีโน้ตกับข้อความเก่าเยอะมาก แต่ตอนนี้ไม่แน่ใจว่างานคืบถึงไหนแล้วและอะไรยังค้างอยู่บ้าง',
  },
  {
    label: 'ตัวอย่าง: ยังติดทางไหน',
    value: 'งานนี้ติดเพราะรอไฟล์จากลูกค้า และผมไม่แน่ใจว่าควร follow up ยังไงให้ไม่เสียจังหวะ',
  },
];

export function BrainDumpInput({ onNext, initialText, studioPanel }: Props) {
  const [val, setVal] = useState(() => initialText ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const acceptedFileTypes = useMemo(
    () => 'application/pdf,image/*,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml',
    [],
  );

  useEffect(() => {
    if (!initialText) return;
    setVal((current) => (current.trim().length === 0 ? initialText : current));
  }, [initialText]);

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
  const canSubmit = !isSubmitting && (val.trim().length > 0 || hasFiles);

  const buildFallbackSubmission = (): RoomSubmission => {
    const sourceFiles: RoomSourceFile[] = files.map((file) => ({
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      kind: inferRoomFileKind(file.name, file.type),
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      status: 'failed',
      createdAt: Date.now(),
      failureReason: 'file_extraction_unavailable',
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

  const submit = async () => {
    if (isSubmitting || (!val.trim() && files.length === 0)) return;
    setIsSubmitting(true);
    setUploadError(null);

    try {
      let submission: RoomSubmission;

      if (files.length > 0) {
        const formData = new FormData();
        formData.append('text', val);
        files.forEach((file) => formData.append('files', file, file.name));

        const response = await fetch('/api/file-room/extract', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error?.message || `extract_failed_${response.status}`);
        }

        submission = {
          text: typeof data.text === 'string' ? data.text : val,
          sourceText: typeof data.sourceText === 'string' ? data.sourceText : val,
          extractedText: typeof data.extractedText === 'string' ? data.extractedText : '',
          sourceFiles: Array.isArray(data.sourceFiles) ? data.sourceFiles : [],
        };
      } else {
        submission = {
          text: val,
          sourceText: val.trim(),
          extractedText: '',
          sourceFiles: [],
        };
      }

      trackEvent('dump_submitted');
      await onNext(submission);
      setVal('');
      setFiles([]);
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      const fallbackSubmission = buildFallbackSubmission();
      setUploadError('ไฟล์แนบยังสกัดไม่ได้ MIND จะใช้ข้อความที่มีอยู่ต่อให้ก่อน');
      trackEvent('dump_submitted');
      await onNext(fallbackSubmission);
      setVal('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            MIND
          </p>
          <h1 style={{ fontSize: '2rem', fontWeight: 650, lineHeight: 1.08 }}>
            พิมพ์สภาพงานมาก่อน แล้วค่อยแนบไฟล์ถ้ามี
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '36rem' }}>
            ไม่มีไฟล์ก็เริ่มได้ วางอีเมลลูกค้า แชต feedback หรือโน้ตสั้น ๆ ลงมาก่อน แล้วค่อยใช้ไฟล์เป็น context เสริมถ้ามี
          </p>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
            {['ไม่มีไฟล์ก็เริ่มได้', 'Text-first', 'Files optional'].map((badge) => (
              <span
                key={badge}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '999px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  letterSpacing: '0.02em',
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.7rem',
          padding: 'clamp(0.6rem, 1.7vw, 0.9rem) 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            เริ่มได้ใน 3 จังหวะ ไม่ต้องมีไฟล์ก็ได้
          </p>
          {INPUT_STEPS.map((step, index) => (
            <div key={step.title} style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start' }}>
              <div style={{
                width: '1.65rem',
                height: '1.65rem',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '0.85rem',
                marginTop: '0.12rem',
              }}>
                {index + 1}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.98rem' }}>{step.title}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            แตะตัวอย่างเพื่อเริ่มเร็วขึ้น
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {INPUT_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setVal(example.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-primary)',
                  padding: '0.55rem 0.8rem',
                  fontSize: '0.82rem',
                  borderRadius: '999px',
                }}
              >
                {example.label}
              </button>
            ))}
          </div>
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
            <p style={{ margin: 0, fontWeight: 600 }}>ไม่มีไฟล์ก็เริ่มได้</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
              วางข้อความ พิมพ์โน้ต หรือแนบ PDF, screenshot, และไฟล์ข้อความเป็น context เสริมถ้ามี
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
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
          type="file"
          multiple
          accept={acceptedFileTypes}
          style={{ display: 'none' }}
          onChange={(event) => {
            if (event.target.files) pushFiles(event.target.files);
            event.currentTarget.value = '';
          }}
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
          <span>ลากไฟล์มาวางในกล่องนี้ได้เลย ถ้ามี</span>
          <span>{hasFiles ? `${files.length} ไฟล์ใน room นี้` : 'ไม่มีไฟล์ก็เริ่มได้ · แนบเพิ่มได้: PDF, ภาพ, text, CSV'}</span>
        </div>

        <textarea
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="พิมพ์สภาพงานตอนนี้ตรง ๆ ได้เลย เช่น ลูกค้าส่ง feedback มา / งานค้างไปหลายวัน / รอไฟล์จากลูกค้า..."
          aria-label="พิมพ์สภาพงานของคุณ"
          style={{
            flex: 1,
            minHeight: 'clamp(220px, 34vh, 280px)',
            borderRadius: '18px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(13,13,18,0.42)',
            padding: '1rem 1.05rem',
          }}
          autoFocus
          disabled={isSubmitting}
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
                <button type="button" onClick={() => removeFileAt(index)}>
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

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          ไม่มีไฟล์ก็เริ่มได้ MIND จะใช้ข้อความที่คุณพิมพ์ก่อน แล้วค่อยอ่านไฟล์เป็น context เสริมถ้ามี
        </p>

        <button className="primary" onClick={submit} disabled={!canSubmit}>
          {isSubmitting ? 'กำลังสรุป...' : 'สรุปให้เลย'}
        </button>
      </div>

      {studioPanel}
    </div>
  );
}
