import type { AiSynthesisResponse } from '@/lib/ai/schema';
import type { Action, AppSession, TaskContext } from '@/lib/store/idb';
import { hasResumableTask } from '@/lib/orchestrator/task-machine';

export type StudioIntentId =
  | 'review_status'
  | 'next_move'
  | 'make_smaller'
  | 'unstick';

export interface StudioIntent {
  id: StudioIntentId;
  label: string;
  description: string;
  active: boolean;
  blockedReason?: string;
}

export type StudioProvenanceConfidence = 'low' | 'medium' | 'high';

export interface StudioProvenance {
  inputsUsed: string[];
  changesSince: string[];
  whyThisNow: string;
  confidence: StudioProvenanceConfidence;
}

export interface StudioSnapshot {
  title: string;
  summary: string;
  blockers: string[];
  actionTitle?: string;
  fileCount: number;
  contextLabel: string;
  lastUpdatedLabel: string;
  provenance?: StudioProvenance;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function fallbackTaskTitle(task: TaskContext) {
  const sourceText = task.sourceText.trim();
  if (!sourceText) return 'งานนี้';
  return truncateText(sourceText.replace(/\s+/g, ' '), 72);
}

function normalizeCompactText(value?: string | null) {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed || '';
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function buildStudioProvenance(
  task: TaskContext,
  title: string,
  summary: string,
): StudioProvenance {
  const inputsUsed = uniqueStrings([
    task.reentryBrief?.summary ? 'reentry brief' : undefined,
    task.currentPlan?.actionTitle ? 'แผนปัจจุบัน' : undefined,
    task.lastSynthesis?.situation_summary ? 'สรุปล่าสุด' : undefined,
    task.taskFrame?.objective ? 'เป้าหมายงาน' : undefined,
    task.sourceFiles.length > 0 ? `${task.sourceFiles.length} ไฟล์` : undefined,
    !task.reentryBrief?.summary && !task.lastSynthesis?.situation_summary ? 'ข้อความต้นทาง' : undefined,
  ]);

  const changedSince = uniqueStrings([
    task.lastStableSummary && normalizeCompactText(task.lastStableSummary) !== normalizeCompactText(summary)
      ? 'สรุปนี้ต่างจาก stable summary เดิม'
      : undefined,
    task.lastSynthesis?.situation_summary &&
      normalizeCompactText(task.lastSynthesis.situation_summary) !== normalizeCompactText(summary)
      ? 'สรุปนี้ต่างจาก synthesis ล่าสุด'
      : undefined,
    task.currentPlan?.actionTitle && normalizeCompactText(task.currentPlan.actionTitle) !== normalizeCompactText(title)
      ? 'title นี้ต่างจากแผนปัจจุบัน'
      : undefined,
  ]);

  const whyThisNow = task.reentryBrief?.summary
    ? 'ใช้ reentry brief ล่าสุดเป็นฐาน เพราะเป็น save point ที่ใกล้การกลับเข้าห้องที่สุด'
    : task.lastSynthesis?.situation_summary
      ? 'ใช้สรุปล่าสุดเป็นฐาน เพราะยังไม่มี reentry brief'
      : task.currentPlan?.actionTitle
        ? 'ใช้แผนปัจจุบันเป็นฐาน เพราะมี next step ที่เริ่มต่อได้'
        : task.taskFrame?.objective
          ? 'ใช้เป้าหมายงานเป็นฐาน เพราะยังไม่มี summary ที่ชัดพอ'
          : 'ยังไม่มี summary ชัดพอ จึงอิงข้อความต้นทาง';

  const confidence: StudioProvenanceConfidence = task.reentryBrief?.summary
    ? 'high'
    : task.currentPlan?.actionTitle || task.lastSynthesis?.situation_summary || task.taskFrame?.objective || task.sourceFiles.length > 0
      ? 'medium'
      : 'low';

  return {
    inputsUsed,
    changesSince: changedSince.length > 0 ? changedSince : ['ยังไม่เห็นการเปลี่ยนจากรอบก่อน'],
    whyThisNow,
    confidence,
  };
}

export function formatRelativeTimestamp(timestamp?: number, now = Date.now()) {
  if (!timestamp) return 'ยังไม่มีการอัปเดตล่าสุด';

  const deltaMs = Math.max(0, now - timestamp);
  const deltaMin = Math.floor(deltaMs / 60000);

  if (deltaMin < 1) return 'อัปเดตเมื่อสักครู่';
  if (deltaMin < 60) return `อัปเดต ${deltaMin} นาทีที่แล้ว`;

  const deltaHour = Math.floor(deltaMin / 60);
  if (deltaHour < 24) return `อัปเดต ${deltaHour} ชั่วโมงที่แล้ว`;

  const deltaDay = Math.floor(deltaHour / 24);
  return `อัปเดต ${deltaDay} วันที่แล้ว`;
}

export function hasFreshReentryBrief(task?: TaskContext, sessionLastActive?: number) {
  if (!task?.reentryBrief) return false;
  if (!sessionLastActive) return true;
  return task.reentryBrief.createdAt >= sessionLastActive;
}

export function buildStudioSnapshot(
  task?: TaskContext,
  action?: Action | null,
  payload?: AiSynthesisResponse | null,
): StudioSnapshot | null {
  if (!task) return null;

  const title =
    task.taskFrame?.objective ||
    task.currentPlan?.actionTitle ||
    action?.title ||
    payload?.recommended_action.title ||
    fallbackTaskTitle(task);

  const summary =
    task.reentryBrief?.summary ||
    task.lastSynthesis?.situation_summary ||
    action?.situationSummary ||
    truncateText(task.sourceText.replace(/\s+/g, ' '), 180);

  const fileCount = task.sourceFiles.length;
  const actionTitle =
    task.currentPlan?.actionTitle ||
    action?.title ||
    payload?.recommended_action.title;

  const lastUpdatedAt = Math.max(
    task.reentryBrief?.createdAt ?? 0,
    task.lastAttemptAt ?? 0,
    task.createdAt,
  );

  return {
    title,
    summary,
    blockers: task.blockerSignals.slice(0, 3),
    actionTitle,
    fileCount,
    contextLabel: fileCount > 0 ? `${fileCount} ไฟล์ + ข้อความเดิม` : 'ข้อความเดิมของงานนี้',
    lastUpdatedLabel: formatRelativeTimestamp(lastUpdatedAt),
    provenance: buildStudioProvenance(task, title, summary),
  };
}

export function getStudioIntents(
  session: AppSession,
  action?: Action | null,
  payload?: AiSynthesisResponse | null,
): StudioIntent[] {
  const task = session.task;
  const hasActionContext = Boolean(task && action && payload);
  const completionLocked = task?.assistantMode === 'scaffold_completion';
  const hasLiveScaffoldContext = hasActionContext && !completionLocked;
  const canReviewStatus = Boolean(task);
  const canResumeFlow = Boolean(task);

  return [
    {
      id: 'review_status',
      label: 'กลับมาดูสถานะ',
      description: canReviewStatus
        ? hasResumableTask(task)
          ? 'ดูว่างานนี้ค้างตรงไหนและควรกลับไปเริ่มจากอะไร'
          : 'ดู snapshot ล่าสุดของงานนี้ก่อนจะขยับต่อ'
        : 'พิมพ์หรือวางบริบทของงานนี้ก่อน แล้ว MIND จะช่วยสรุปสถานะให้',
      active: canReviewStatus,
      blockedReason: canReviewStatus ? undefined : 'ยังไม่มีบริบทของงานนี้ให้สรุป',
    },
    {
      id: 'next_move',
      label: 'หา next move',
      description: canResumeFlow
        ? 'ใช้ข้อความเดิมของงานนี้เพื่อหาก้าวถัดไปที่เริ่มได้เลย'
        : 'พิมพ์สภาพงานก่อน แล้วค่อยให้ MIND เลือกก้าวถัดไป',
      active: canResumeFlow,
      blockedReason: canResumeFlow ? undefined : 'พิมพ์หรือวางบริบทของงานนี้ก่อน',
    },
    {
      id: 'make_smaller',
      label: completionLocked ? 'งานรอบนี้จบแล้ว' : 'ย่อยงานให้เล็ก',
      description: hasLiveScaffoldContext
        ? 'กลับไปแตกก้าวนี้ให้เล็กลง โดยยังไม่ทิ้งเป้าหมายเดิม'
        : completionLocked
          ? 'งานรอบนี้จบแล้ว ถ้าจะเริ่มงานใหม่ให้กดจาก completion summary ก่อน'
          : 'ต้องมีก้าวปัจจุบันก่อน ถึงจะย่อยให้เล็กลงต่อได้',
      active: hasLiveScaffoldContext,
      blockedReason: hasLiveScaffoldContext
        ? undefined
        : completionLocked
          ? 'งานรอบนี้จบแล้ว ถ้าจะเริ่มงานใหม่ให้กดจาก completion summary ก่อน'
          : 'ต้องมีก้าวปัจจุบันก่อนถึงจะย่อยต่อได้',
    },
    {
      id: 'unstick',
      label: completionLocked ? 'ยังไม่ต้อง rescue' : 'ช่วยตอนติด',
      description: hasLiveScaffoldContext
        ? 'ให้ MIND ช่วยวินิจฉัยว่าติดตรงไหนจากบริบทเดิมของงานนี้'
        : completionLocked
          ? 'งานรอบนี้เพิ่งจบแล้ว จึงยังไม่ต้องเข้า rescue'
          : 'ต้องมี action ปัจจุบันก่อน ถึงจะช่วยวินิจฉัยอาการติดได้',
      active: hasLiveScaffoldContext,
      blockedReason: hasLiveScaffoldContext
        ? undefined
        : completionLocked
          ? 'งานรอบนี้เพิ่งจบแล้ว จึงยังไม่ต้องเข้า rescue'
          : 'ต้องมีก้าวหรือ action ปัจจุบันก่อน',
    },
  ];
}
