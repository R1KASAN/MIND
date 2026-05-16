"use client";

import { useEffect, useMemo, useState } from 'react';
import { trackEvent, useTrackMountEvent } from '@/lib/instrumentation';
import { getRoomFileUxCopy } from '@/lib/room';
import type { TaskContext } from '@/lib/store/idb';
import {
  buildPreDeleteWarning,
  buildRoomDataSources,
  searchRoomDataSources,
  shouldUseRicherRoomRetrieval,
  type RoomDataSource,
  type RoomDataSourceStatus,
  type RoomDataSourceType,
} from '@/lib/retrieval/room-data';
import {
  answerRoomTrustReviewQuestion,
  buildRoomTrustReviewModel,
  type RoomTrustReviewModel,
} from '@/lib/retrieval/room-memory-sources';
import type { RoomMemoryEventType, RoomMemorySnapshot } from '@/lib/store/room-memory-db';

type PanelMode = 'manage' | 'review';
type TypeFilter = RoomDataSourceType | 'all';
type StatusFilter = RoomDataSourceStatus | 'all';

interface Props {
  task: TaskContext;
  initialMode: PanelMode;
  onClose: () => void;
  onDeleteSources: (deleteTokens: string[]) => void | Promise<void>;
  onSelectPrimarySource?: (fileId: string) => void | Promise<void>;
}

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'ทุกชนิด' },
  { value: 'text', label: 'ข้อความ / โน้ต' },
  { value: 'file', label: 'ไฟล์' },
  { value: 'clarification', label: 'คำตอบเพิ่ม' },
  { value: 'manual_rescue', label: 'โน้ตตอน rescue' },
  { value: 'memory_ref', label: 'Room memory' },
];

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'ready', label: 'พร้อมใช้' },
  { value: 'pending', label: 'กำลังอ่าน' },
  { value: 'failed', label: 'อ่านไม่สำเร็จ' },
  { value: 'unsupported', label: 'ยังไม่รองรับ' },
  { value: 'tombstone', label: 'ถูกลบแล้ว' },
  { value: 'missing', label: 'ต้นทางหาย' },
];

function buildFallbackTrustModel(task: TaskContext): RoomTrustReviewModel {
  return {
    snapshot: null,
    recentEvents: [],
    sources: buildRoomDataSources(task),
    evidenceHealth: {
      available: 0,
      tombstone: 0,
      missing: 0,
      total: 0,
    },
  };
}

function formatSourceTypeLabel(type: RoomDataSourceType) {
  switch (type) {
    case 'text':
      return 'ข้อความ / โน้ต';
    case 'file':
      return 'ไฟล์';
    case 'clarification':
      return 'คำตอบเพิ่ม';
    case 'manual_rescue':
      return 'โน้ตตอน rescue';
    case 'memory_ref':
      return 'Room memory';
  }
}

function formatSourceStatusLabel(status: RoomDataSourceStatus) {
  switch (status) {
    case 'ready':
      return 'พร้อมใช้';
    case 'pending':
      return 'กำลังอ่าน';
    case 'unreadable':
      return 'อ่านไม่ได้';
    case 'failed_extraction':
      return 'แยกข้อความไม่สำเร็จ';
    case 'failed':
      return 'อ่านไม่สำเร็จ';
    case 'unsupported':
      return 'ยังไม่รองรับ';
    case 'tombstone':
      return 'source ถูกลบแล้ว';
    case 'missing':
      return 'ต้นทางหาย';
  }
}

function formatUsageLabel(source: RoomDataSource) {
  if (source.usedInPlanCount > 0) {
    return `ใช้ใน next move ล่าสุด ${Math.min(source.usedInPlanCount, 3)} ครั้ง`;
  }
  if (source.unusedDays !== null && source.unusedDays >= 90) {
    return 'ไม่ได้ใช้มา 90+ วัน';
  }
  return 'ยังไม่ถูกใช้ใน step ที่ยืนยันแล้ว';
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return 'ยังไม่มี event';
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatEventTypeLabel(type: RoomMemoryEventType) {
  switch (type) {
    case 'source_added':
      return 'มี context ใหม่';
    case 'summary_updated':
      return 'summary เปลี่ยน';
    case 'blocker_updated':
      return 'blocker เปลี่ยน';
    case 'action_selected':
      return 'เลือก next move';
    case 'plan_updated':
      return 'plan เปลี่ยน';
    case 'rescue_created':
      return 'สร้าง rescue';
    case 'reentry_created':
      return 'สร้าง reentry';
  }
}

function TrustSummary({ snapshot }: { snapshot: RoomMemorySnapshot | null }) {
  const planSteps = snapshot?.currentPlan?.steps.slice(0, 3) ?? [];
  return (
    <section className="data-trust-section">
      <div className="data-review-result-head">
        <p className="studio-eyebrow">Trust Summary</p>
        <span className="studio-chip">snapshot {snapshot ? `v${snapshot.version}` : 'ยังไม่มี'}</span>
      </div>
      {snapshot ? (
        <div className="data-trust-stack">
          <div>
            <p className="data-trust-label">Room summary</p>
            <p className="studio-inline-note" style={{ margin: 0 }}>
              {snapshot.currentSummary || 'ยังไม่มี summary ที่ project เข้า snapshot'}
            </p>
          </div>
          <div className="data-trust-grid">
            <div>
              <p className="data-trust-label">Current action</p>
              <p>{snapshot.currentAction?.title || 'ยังไม่มี next move ใน snapshot'}</p>
            </div>
            <div>
              <p className="data-trust-label">Current plan</p>
              <p>{snapshot.currentPlan?.actionTitle || 'ยังไม่มี plan ใน snapshot'}</p>
            </div>
          </div>
          {planSteps.length > 0 && (
            <ol className="data-trust-list">
              {planSteps.map((step) => <li key={step.id}>{step.text}</li>)}
            </ol>
          )}
          <div className="data-source-status-line">
            {snapshot.currentBlockers.length > 0 ? snapshot.currentBlockers.map((blocker) => (
              <span key={blocker} className="studio-chip studio-chip-danger">{blocker}</span>
            )) : <span className="studio-chip">ไม่มี blocker ใน snapshot</span>}
            {snapshot.latestRescue && <span className="studio-chip">latest rescue: {snapshot.latestRescue.reason}</span>}
            {snapshot.latestReentry && <span className="studio-chip">latest reentry: {formatTimestamp(snapshot.latestReentry.createdAt)}</span>}
          </div>
        </div>
      ) : (
        <p className="studio-inline-note" style={{ margin: 0 }}>
          ยังไม่มี Room Memory snapshot สำหรับห้องนี้ ระบบจะใช้ source metadata ปัจจุบันก่อน
        </p>
      )}
    </section>
  );
}

function EvidenceHealth({ model }: { model: RoomTrustReviewModel }) {
  const health = model.evidenceHealth;
  return (
    <section className="data-trust-section">
      <div className="data-review-result-head">
        <p className="studio-eyebrow">Evidence Health</p>
        <span className="studio-chip">{health.total} refs</span>
      </div>
      <div className="data-evidence-health">
        <div className="data-health-item">
          <strong>{health.available}</strong>
          <span>available</span>
        </div>
        <div className="data-health-item is-warning">
          <strong>{health.tombstone}</strong>
          <span>tombstone</span>
        </div>
        <div className="data-health-item is-warning">
          <strong>{health.missing}</strong>
          <span>missing</span>
        </div>
      </div>
      <p className="studio-inline-note" style={{ margin: 0 }}>
        Tombstone/missing คือหลักฐานที่เคยถูกอ้างถึง แต่ไม่ดึง raw content ที่ถูกลบกลับมา
      </p>
    </section>
  );
}

function CompactEvents({ model }: { model: RoomTrustReviewModel }) {
  return (
    <section className="data-trust-section">
      <div className="data-review-result-head">
        <p className="studio-eyebrow">Continuity Events</p>
        <span className="studio-chip">last {model.recentEvents.length}/10</span>
      </div>
      {model.recentEvents.length === 0 ? (
        <p className="studio-inline-note" style={{ margin: 0 }}>ยังไม่มี continuity event ให้ตรวจ</p>
      ) : (
        <div className="data-event-list">
          {model.recentEvents.map((event) => (
            <article key={event.id} className="data-event-row">
              <div>
                <p>{formatEventTypeLabel(event.type)}</p>
                <span>{event.summary}</span>
              </div>
              <div className="data-source-status-line">
                <span className="studio-chip">{event.origin}</span>
                <span className="studio-chip">{formatTimestamp(event.createdAt)}</span>
                {event.refs.length > 0 && <span className="studio-chip">{event.refs.length} refs</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SourceCard({
  source,
  checked,
  primarySourceId,
  onToggle,
  onSelectPrimarySource,
}: {
  source: RoomDataSource;
  checked?: boolean;
  primarySourceId?: string;
  onToggle?: () => void;
  onSelectPrimarySource?: (fileId: string) => void | Promise<void>;
}) {
  const fileId = source.type === 'file' && source.id.startsWith('file:')
    ? source.id.slice('file:'.length)
    : undefined;
  const isPrimary = Boolean(primarySourceId && source.id === primarySourceId);
  const canBecomePrimary = Boolean(fileId && source.status === 'ready' && onSelectPrimarySource && !isPrimary);

  return (
    <article className="data-source-card">
      <div className="data-source-card-head">
        <div className="data-source-title-wrap">
          <p className="studio-eyebrow">{source.label}</p>
          <h3 className="data-source-title">{source.title}</h3>
        </div>
        {onToggle && source.deletable !== false && (
          <label className="data-source-check">
            <input type="checkbox" checked={checked} onChange={onToggle} />
            <span>เลือก</span>
          </label>
        )}
      </div>

      <p className="studio-inline-note" style={{ margin: 0 }}>
        {source.excerpt}
      </p>
      <div className="data-source-status-line">
        <span className="studio-chip">{formatSourceStatusLabel(source.status)}</span>
        <span className="studio-chip">{formatSourceTypeLabel(source.type)}</span>
        <span className="studio-chip">{formatUsageLabel(source)}</span>
        {isPrimary && <span className="studio-chip studio-chip-success">ไฟล์หลัก</span>}
        {source.storageKey && <span className="studio-chip">ไฟล์เก็บในเครื่อง</span>}
        {source.refStatus === 'available' && <span className="studio-chip">memory ref พร้อมใช้</span>}
        {source.refStatus === 'tombstone' && <span className="studio-chip studio-chip-danger">เคยมี evidence แต่ถูกลบแล้ว</span>}
        {source.refStatus === 'missing' && <span className="studio-chip studio-chip-danger">memory ref หาต้นทางไม่เจอ</span>}
        {(source.memoryRefIds?.length ?? 0) > 0 && <span className="studio-chip">{source.memoryRefIds?.length} memory refs</span>}
        {source.recentEventTypes?.map((type) => (
          <span key={type} className="studio-chip">{type}</span>
        ))}
      </div>
      {source.type === 'file' && (
        <p className="studio-inline-note" style={{ margin: 0 }}>
          {getRoomFileUxCopy(source.status === 'ready'
            ? { status: 'ready', failureReason: undefined }
            : (source.originMeta?.failureReason as string | undefined)).body}
        </p>
      )}

      <div className="data-source-chip-row">
        {source.sensitiveFlags.map((flag) => (
          <span key={flag} className="studio-chip studio-chip-danger">{flag}</span>
        ))}
      </div>
      {source.type === 'file' && (
        <div className="data-source-chip-row">
          {isPrimary ? (
            <span className="studio-chip studio-chip-success">ใช้เป็นฐาน summary / next move อยู่</span>
          ) : source.status === 'ready' && onSelectPrimarySource ? (
            <button
              type="button"
              className="studio-context-button"
              disabled={!canBecomePrimary}
              onClick={() => {
                if (!fileId || !onSelectPrimarySource) return;
                void onSelectPrimarySource(fileId);
              }}
            >
              ใช้เป็นไฟล์หลัก
            </button>
          ) : source.status === 'ready' ? (
            <span className="studio-chip">พร้อมเลือกเป็นไฟล์หลักใน Manage Data</span>
          ) : (
            <span className="studio-chip">ต้อง retry ก่อนถึงจะเลือกเป็นไฟล์หลักได้</span>
          )}
        </div>
      )}
    </article>
  );
}

export function DataReviewPanel({
  task,
  initialMode,
  onClose,
  onDeleteSources,
  onSelectPrimarySource,
}: Props) {
  useTrackMountEvent(initialMode === 'manage' ? 'archive_searched' : 'overview_opened', {
    surface: initialMode === 'manage' ? 'manage_data' : 'review_room',
    room_id: task.roomId,
  });
  const [mode, setMode] = useState<PanelMode>(initialMode);
  const [query, setQuery] = useState('');
  const [reviewQuestion, setReviewQuestion] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [trustModel, setTrustModel] = useState<RoomTrustReviewModel>(() => buildFallbackTrustModel(task));
  const sources = trustModel.sources;
  const retrievalReady = shouldUseRicherRoomRetrieval(task, sources);
  const hasRoomMemoryRefs = sources.some((source) => source.type === 'memory_ref');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let active = true;
    const fallbackModel = buildFallbackTrustModel(task);
    setTrustModel(fallbackModel);
    setSelectedTokens(new Set());
    setConfirmDelete(false);

    void buildRoomTrustReviewModel(task)
      .then((nextModel) => {
        if (!active) return;
        setTrustModel(nextModel);
      })
      .catch(() => {
        if (!active) return;
        setTrustModel(fallbackModel);
      });

    return () => {
      active = false;
    };
  }, [task]);

  const manageResults = useMemo(() => searchRoomDataSources({
    sources,
    roomId: task.roomId ?? '',
    query,
    type: typeFilter,
    status: statusFilter,
    sensitiveOnly,
  }), [query, sensitiveOnly, sources, statusFilter, task.roomId, typeFilter]);

  const reviewAnswer = useMemo(() => {
    const question = reviewQuestion.trim();
    if (!question) return null;
    return answerRoomTrustReviewQuestion(question, trustModel, task.roomId ?? '');
  }, [reviewQuestion, task.roomId, trustModel]);

  const selectedSources = useMemo(() => (
    sources.filter((source) => source.deletable !== false && selectedTokens.has(source.deleteToken))
  ), [selectedTokens, sources]);

  const deleteWarning = buildPreDeleteWarning(selectedSources);
  const canDelete = selectedSources.length > 0;

  const toggleToken = (token: string) => {
    setSelectedTokens((current) => {
      const next = new Set(current);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
    setConfirmDelete(false);
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    if (deleteWarning && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const tokens = selectedSources.map((source) => source.deleteToken);
    await onDeleteSources(tokens);
    trackEvent('data_deleted', {
      room_id: task.roomId,
      source_count: tokens.length,
      sensitive_flags: [...new Set(selectedSources.flatMap((source) => source.sensitiveFlags))],
    });
    setSelectedTokens(new Set());
    setConfirmDelete(false);
  };

  return (
    <div className="data-review-overlay" role="dialog" aria-modal="true" aria-label="Manage room data">
      <div className="data-review-panel">
        <header className="data-review-header">
          <div>
            <p className="studio-eyebrow">หลักฐานในห้อง</p>
            <h2 className="data-review-title">{mode === 'manage' ? 'จัดการข้อมูล' : 'ทบทวนห้อง'}</h2>
            <p className="studio-inline-note" style={{ margin: 0 }}>
              {retrievalReady
                ? 'อ่านจาก snapshot, recent events, และ refs ของ Room Memory แบบ bounded replay'
                : hasRoomMemoryRefs
                  ? 'แสดงหลักฐานจาก TaskContext พร้อม Room Memory refs และสถานะ tombstone / missing'
                  : 'ใช้ metadata + summaries ของห้องนี้ก่อน ถ้า source เยอะขึ้นค่อยเปิด retrieval ที่ละเอียดขึ้น'}
            </p>
          </div>
          <button type="button" className="shell-secondary-button" onClick={onClose}>ปิด</button>
        </header>

        <div className="data-review-tabs" role="tablist" aria-label="Data review modes">
          <button
            type="button"
            className={mode === 'review' ? 'is-active' : ''}
            onClick={() => setMode('review')}
          >
            ทบทวนห้อง
          </button>
          <button
            type="button"
            className={mode === 'manage' ? 'is-active' : ''}
            onClick={() => setMode('manage')}
          >
            จัดการข้อมูล
          </button>
        </div>

        {mode === 'manage' ? (
          <div className="data-review-grid">
            <aside className="data-review-controls">
              <label className="data-review-field">
                <span>ค้นหาเชิงความหมาย</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="budget, phase 2, contract, deadline..."
                />
              </label>
              <label className="data-review-field">
                <span>ประเภท</span>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.currentTarget.value as TypeFilter)}>
                  {TYPE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="data-review-field">
                <span>สถานะ</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}>
                  {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="data-review-check">
                <input
                  type="checkbox"
                  checked={sensitiveOnly}
                  onChange={(event) => setSensitiveOnly(event.currentTarget.checked)}
                />
                <span>แสดงเฉพาะ contract / payment / deadline</span>
              </label>

              <div className="data-delete-box">
                <p className="studio-eyebrow" style={{ marginBottom: 0 }}>ลบหลายรายการ</p>
                <p className="studio-inline-note" style={{ margin: 0 }}>
                  เลือก source แล้วลบออกจากบริบทของห้องนี้เท่านั้น
                </p>
                {deleteWarning && (
                  <p className="data-warning-note">
                    {deleteWarning.message}
                  </p>
                )}
                <button type="button" disabled={!canDelete} onClick={() => void handleDelete()}>
                  {deleteWarning && !confirmDelete ? 'ตรวจ warning ก่อนลบ' : `ลบ ${selectedSources.length} source`}
                </button>
              </div>
            </aside>

            <section className="data-review-results">
              <div className="data-review-result-head">
                <p className="studio-eyebrow">รายการหลักฐาน</p>
                <span className="studio-chip">{manageResults.length} รายการ</span>
              </div>
              {manageResults.length === 0 ? (
                <p className="studio-inline-note">ไม่พบ source ที่ตรงกับเงื่อนไขนี้</p>
              ) : (
                manageResults.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    checked={selectedTokens.has(source.deleteToken)}
                    primarySourceId={task.sourcePreference?.primarySourceId}
                    onToggle={source.deletable === false ? undefined : () => toggleToken(source.deleteToken)}
                    onSelectPrimarySource={onSelectPrimarySource}
                  />
                ))
              )}
            </section>
          </div>
        ) : (
          <div className="data-review-grid">
            <aside className="data-review-controls">
              <TrustSummary snapshot={trustModel.snapshot} />
              <EvidenceHealth model={trustModel} />
              <label className="data-review-field">
                <span>ถามจากหลักฐานในห้องนี้</span>
                <textarea
                  value={reviewQuestion}
                  onChange={(event) => setReviewQuestion(event.currentTarget.value)}
                  placeholder="เช่น เราตกลงอะไรไว้ใน phase 2? หรือ มีอะไรเกี่ยวกับ budget บ้าง?"
                />
              </label>
              <div className="data-review-examples">
                {['what did we agree on for phase 2?', 'show all items about budget', 'what is the safest next move?'].map((item) => (
                  <button key={item} type="button" onClick={() => setReviewQuestion(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </aside>

            <section className="data-review-results">
              <CompactEvents model={trustModel} />
              <div className="data-review-result-head">
                <p className="studio-eyebrow">คำตอบในภาษางาน</p>
                <span className="studio-chip">{reviewAnswer?.retrievalEnabled ? 'ดึงหลักฐานได้' : 'deterministic search'}</span>
              </div>
              {!reviewAnswer ? (
                <p className="studio-inline-note">
                  ถามเป็นภาษางาน เช่น phase, budget, scope, deadline แล้ว MIND จะดึง source ที่เกี่ยวข้องมาให้ตรวจ
                </p>
              ) : (
                <>
                  <div className="data-review-answer">
                    <p className="studio-eyebrow" style={{ marginBottom: 0 }}>ร่างคำตอบ</p>
                    <p>{reviewAnswer.answer}</p>
                    <p className="studio-inline-note" style={{ margin: 0 }}>
                      ตรวจ evidence ก่อนเอาไปใช้เป็น next move หรือ rescue decision
                    </p>
                  </div>
                  {reviewAnswer.sources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      primarySourceId={task.sourcePreference?.primarySourceId}
                    />
                  ))}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
