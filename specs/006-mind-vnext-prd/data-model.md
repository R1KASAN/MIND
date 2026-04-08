# MIND vNext — Data Model
# โมเดลข้อมูล vNext

**Canonical Path**: `specs/006-mind-vnext-prd/data-model.md`  
**Version**: vNext 1.1.0  
**Storage**: IndexedDB (local-only)  
**Compatibility**: Designed to extend the current `005-mind-full-prd` data shape without turning MIND into a planner

---

## 1. Modeling Goals

โมเดลข้อมูลของ vNext ต้องรองรับ 2 สิ่งพร้อมกัน:
1. เก็บบริบทที่จำเป็นต่อ workflows `client_response` และ `client_resume`
2. ยังคงความเรียบง่ายของโครงสร้างเดิม เพื่อไม่ผลักผลิตภัณฑ์ไปสู่ planner, CRM, หรือ memory-management UI

---

## 2. Required Extensions

### 2.1 Workflow Type
ระบบต้องรู้ว่า session ปัจจุบันอยู่ใน workflow ใด:
- `client_response`
- `client_resume`

ฟิลด์นี้มีไว้เพื่อควบคุมการสังเคราะห์และการแสดงผล ไม่ได้สร้าง mode selector ใหม่ให้ผู้ใช้

### 2.2 Situation Summary
ผลลัพธ์ทุก workflow ต้องมี summary ที่ช่วยคืนบริบทเร็ว:
- ใน `client_response` ใช้สรุปสถานการณ์ปัจจุบันของบทสนทนา
- ใน `client_resume` ใช้สรุปสถานะโปรเจกต์และสิ่งที่ค้างอยู่

### 2.3 Reply Draft
ใช้เฉพาะกับ workflow `client_response` เพื่อรองรับเคสตอบลูกค้า:
- ไม่มีความจำเป็นต้องขยายเป็น compose history
- ไม่ควรถูกตีความเป็น thread manager หรือ inbox system

### 2.4 Blocker Signals
เก็บ inference signal ที่ระบบใช้เพื่อจัดลำดับ one next action เช่น:
- waiting_on_client
- missing_file_or_context
- unclear_scope
- overload_or_low_energy
- unknown

blocker signals เป็น read-only inference ไม่ใช่ user-managed list

### 2.5 Active Dump Context
เก็บ dump ที่กำลังใช้งานอยู่เพื่อรองรับ:
- honest retry
- manual bypass
- comeback หลัง failure

ต้องคงอยู่จนกว่าจะ:
- Ollama success จริง
- ผู้ใช้ discard อย่างชัดเจน
- เริ่ม session ใหม่แทนบริบทเดิม

### 2.6 File Room / TaskContext Room

File Room ของ MIND คือ implementation ของ `TaskContext` ที่รองรับไฟล์และบริบทแบบ room-scoped

กฎของ File Room:
- 1 room = 1 task / 1 client context
- `Room = TaskContext + sourceFiles + extractedText`
- room เดิมต้อง resume ได้จาก `lifecycleState` + `currentStepIndex` + `extractedText`
- context จาก room หนึ่งห้ามไหลไปอีก room
- file upload เป็น context ingestion ไม่ใช่ file browser หรือ shared workspace

File types ใน MVP:
- text
- PDF
- image / screenshot
- table แบบ pasted text / markdown / CSV text

### RoomSourceFile

```typescript
interface RoomSourceFile {
  id: string;
  name: string;
  kind: 'text' | 'pdf' | 'image' | 'table' | 'other';
  mimeType: string;
  size: number;
  status: 'ready' | 'failed' | 'unsupported';
  createdAt: number;
  extractedText?: string;
  failureReason?: string;
}
```

### Room Submission

```typescript
interface RoomSubmission {
  text: string;
  sourceText: string;
  extractedText: string;
  sourceFiles: RoomSourceFile[];
}
```

### TaskContext

```typescript
interface TaskContext {
  id: string;
  workflowType?: 'client_response' | 'client_resume';
  sourceText: string;
  sourceFiles: RoomSourceFile[];
  extractedText: string;
  createdAt: number;
  lastAttemptAt?: number;
  lastFailureReason?: AiFailureReason;
  pendingInputs: PendingInput[];
  blockerSignals: string[];
  lastSynthesis?: AiSynthesisPayload;
  lifecycleState: 'dumped' | 'synthesizing' | 'clarification_needed' | 'has_one_action' | 'in_scaffold' | 'stalled' | 'done' | 'failed';
  currentStepIndex: number;
  currentActionId: string | null;
}
```

---

## 3. Core Entity Shapes

### AppSession

```typescript
interface AppSession {
  id: string;
  status: SessionStatus;
  lastActive: number;
  notThisCount: number;
  currentActionId: string | null;
  currentPayload?: AiSynthesisPayload;
  activeDumpContext?: ActiveDumpContext;
  lastMorningShown?: string;
  hasSeenResetNotice?: boolean;
  hasSeenWalkthrough?: boolean;

  // vNext additions
  lastWorkflowType?: 'client_response' | 'client_resume';
  lastFailureReason?: AiFailureReason;
}
```

### ActiveDumpContext

```typescript
interface ActiveDumpContext {
  text: string;
  createdAt: number;
  lastAttemptAt?: number;
  lastFailureReason?: AiFailureReason;
}
```

### Action

```typescript
interface Action {
  id: string;
  title: string;
  rationale: string;
  microSteps: string[];
  isPinned: boolean;
  state: 'PENDING' | 'DONE' | 'ARCHIVED';
  createdAt: number;

  // vNext additions
  workflowType?: 'client_response' | 'client_resume';
  situationSummary?: string;
  replyDraft?: string;
  detectedBlockers?: string[];
}
```

### AiSynthesisPayload

```typescript
interface AiSynthesisPayload {
  workflow_type: 'client_response' | 'client_resume';
  requires_clarification: boolean;
  clarification_nudge?: string;
  situation_summary: string;
  reply_draft?: string;
  recommended_action: {
    title: string;
    rationale: string;
    micro_steps: [string, string, string];
  };
  alternative_actions: Array<{
    title: string;
    rationale: string;
  }>;
  detected_blockers?: string[];
}
```

### AiFailureReason

```typescript
type AiFailureReason =
  | 'service_down'
  | 'model_missing'
  | 'runtime_boot_failed'
  | 'metal_init_failed'
  | 'request_timeout'
  | 'unknown';
```

---

## 4. State Compatibility

vNext ยังคงใช้ state machine เดิมเป็นฐาน และไม่เพิ่ม route-level complexity ใหม่

```typescript
type SessionStatus =
  | 'DUMP_ENTRY'
  | 'SYNTHESIZING'
  | 'CLARIFICATION'
  | 'ONE_ACTION'
  | 'SCAFFOLD'
  | 'RESCUE'
  | 'BOUNCE_BACK'
  | 'MANUAL_FALLBACK'
  | 'DECISION_BOARD'
  | 'MORNING_RITUAL';
```

ข้อสังเกต:
- `ONE_ACTION` ยังคงเป็น primary display state
- `MANUAL_FALLBACK` ยังอยู่ แต่ใช้ในฐานะ explicit bypass เท่านั้น
- ไม่เพิ่ม planner-oriented state หรือ client-management surface

---

## 5. Persistence Rules

| Concern | Rule |
|---|---|
| Active dump | ต้องคงอยู่ข้าม failure/retry จนกว่าจะ success หรือ discard อย่างชัดเจน |
| Situation summary | เก็บเท่าที่จำเป็นต่อ current session, resume, และ recovery |
| Reply draft | เก็บเพื่อรองรับ session ปัจจุบันและ recovery ได้ แต่ไม่ขยายเป็น compose history |
| Blocker signals | ใช้เป็น read-only inference signal ไม่กลายเป็น user-managed board |
| Pattern memory | เก็บในระดับเบาเพื่อช่วย output รอบถัดไป แต่ไม่สร้าง management surface |
| Archive | ยังเป็น search-only ไม่กลายเป็น history browser |

---

## 6. Storage Scope

vNext ควรพยายามใช้ key หลักชุดเดิมให้มากที่สุด:
- `mind_session`
- `mind_actions`

หลักการ:
- ไม่เพิ่ม schema ที่ผลักระบบไปเป็น CRM, planner, หรือ client database
- ไม่เพิ่ม entity ที่ทำให้ผู้ใช้ต้องบริหาร project metadata เอง
- `room` ต้องผูกอยู่กับ `mind_session.task` เป็นหลัก ไม่ใช่พื้นที่ workspace แยกใหม่

---

## 7. Privacy Constraints

- ข้อมูลทั้งหมดต้องอยู่ใน device boundary
- ห้ามมี cloud sync ใน vNext รอบนี้
- export/delete all ต้องครอบคลุม field ใหม่ของ vNext
- ข้อมูลลูกค้าควรถูกเก็บเท่าที่จำเป็นต่อ recovery และ restart flow เท่านั้น

---

## 8. Non-Goals for Data Model

สิ่งที่ห้ามเพิ่มเข้า data model ของ vNext:
- deadline fields
- schedule/calendar entities
- team/shared workspace entities
- CRM-style client records แบบเต็มรูปแบบ
- editable blocker boards
- visible memory libraries
