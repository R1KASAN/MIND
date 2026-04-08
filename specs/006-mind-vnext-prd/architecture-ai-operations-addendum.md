# MIND vNext — Architecture & AI Operations Addendum
# ภาคผนวกสถาปัตยกรรมและ AI Operations

**Canonical Path**: `specs/006-mind-vnext-prd/architecture-ai-operations-addendum.md`  
**Version**: vNext 1.2.0-draft  
**Status**: Draft — Implementation Ready  
**Depends On**:
- `specs/006-mind-vnext-prd/spec.md`
- `specs/006-mind-vnext-prd/data-model.md`
- `specs/006-mind-vnext-prd/contracts/ai-contract.md`
- `AGENTS.md`

---

## 1. Purpose

เอกสารนี้ขยายจาก PRD หลักเพื่อกำหนดทิศทางเชิง architecture สำหรับ MIND เวอร์ชันถัดไป โดยมีเป้าหมายให้ MIND เปลี่ยนจาก:

- single synthesis pipeline
- AI ที่เด่นเฉพาะ intake/first action

ไปสู่:

- operation-based AI architecture
- persistent task copilot ที่ช่วยทั้ง intake, action, scaffold, rescue, และ reentry

กฎสำคัญ:
- local-only และ Ollama-first ยังคงเป็นข้อบังคับ
- task room ยังคงเป็นหน่วยหลักของ context
- MIND ยังไม่กลายเป็น planner, team workspace, หรือ file manager

---

## 2. Product-Level Operating Model

### 2.1 Core framing

MIND = local-first AI task copilot ที่พาคนใช้จาก:
- client chaos
- room context ที่กระจัดกระจาย
- งานที่เริ่มไม่ออกหรืองานที่ค้างอยู่

ไปสู่:
- next move ที่เริ่มได้จริง
- scaffold ที่ปรับตามข้อจำกัดจริง
- rescue plan เมื่อผู้ใช้ติด
- reentry brief เมื่อผู้ใช้กลับมาเริ่มใหม่

### 2.2 Task lifecycle

MIND ต้องมองงานหนึ่งชิ้นเป็น lifecycle ต่อเนื่อง:
1. Intake / Dump
2. ONE_ACTION
3. SCAFFOLD
4. RESCUE
5. REENTRY

AI ต้องเข้ามาช่วยทุก phase ข้างต้น ไม่ใช่เฉพาะ phase แรก

---

## 3. AI Operations Model

### 3.1 Required API routes

แยก `/api/ai` ออกเป็น operation-specific routes:

- `/api/ai/intake`
- `/api/ai/action`
- `/api/ai/scaffold`
- `/api/ai/rescue`
- `/api/ai/reentry`
- `/api/ai/health`

แต่ละ route ต้องมี:
- prompt ของตัวเอง
- contract ของตัวเอง
- timeout และ repair behavior ของตัวเอง
- eval/acceptance criteria ของตัวเอง

### 3.2 Operation responsibilities

#### `/api/ai/intake`

อินพุต:
- `sourceText`
- `extractedText`
- `sourceFiles`
- `pendingInputs`
- `lastFailureReason`

หน้าที่:
- classify workflow
- สร้าง room digest
- สร้าง task frame
- detect blockers
- เสนอ candidate next moves 1–3 แบบ
- ถ้าจำเป็น ถาม clarification ได้ 1 ข้อ

เอาต์พุต:
- `AiIntakeResponse`

#### `/api/ai/action`

อินพุต:
- room digest
- task frame
- blockers
- constraints
- prior attempts
- selected candidate action (optional)

หน้าที่:
- เลือก/สร้าง action หลัก
- อธิบาย why-this-now
- สร้าง alternatives
- สร้าง supporting summary
- สร้าง reply draft เฉพาะ `client_response`
- รองรับ negotiation เช่น reply-first, safer, faster, smaller

เอาต์พุต:
- `AiActionResponse`

#### `/api/ai/scaffold`

อินพุต:
- chosen action
- current plan
- currentStepIndex
- room context
- blockers
- user constraints

หน้าที่:
- break down step ให้กลายเป็น executable scaffold
- refine current step ให้เล็กลง
- reorder steps ได้
- เสนอ shortcut path
- สร้าง lightweight draft artifact ได้ตาม step

เอาต์พุต:
- `AiScaffoldResponse`

#### `/api/ai/rescue`

อินพุต:
- current step
- current plan
- rescue history
- blockers
- failed attempts
- constraints

หน้าที่:
- diagnose reason ที่ติด
- จัดกลุ่ม diagnosis
- สร้าง rescue plan ตาม mode ที่เหมาะ
- ถ้าจำเป็น สร้างข้อความ follow-up หรือ clarification ที่ใช้ได้ทันที

เอาต์พุต:
- `AiRescueResponse`

#### `/api/ai/reentry`

อินพุต:
- recent tasks / active room
- lifecycle state
- currentStepIndex
- lastSynthesis
- lastActiveAt
- last rescue state (optional)

หน้าที่:
- สร้าง reentry brief
- ตัด noise
- เสนอ 1–3 next actions หรือ room candidates ที่น่าทำก่อน
- บอก why-this-first สำหรับวันนั้น

เอาต์พุต:
- `AiReentryResponse`

### 3.3 Operation metadata

ทุก AI operation response ต้องมี metadata ร่วม:

```ts
type AiOperationMeta = {
  model: string;
  confidence?: number;
  usedRoomFiles: string[];
  repairUsed: boolean;
}
```

กฎ:
- `confidence` ใช้ได้เมื่อ operation ประเมินได้จริง
- `usedRoomFiles` ต้องอ้างเฉพาะไฟล์ใน room ปัจจุบัน
- `repairUsed` ต้องสะท้อน contract repair จริง ไม่ใช่เดา

---

## 4. Contract Additions

### 4.1 AiIntakeResponse

```ts
type AiIntakeResponse = {
  workflowType: 'client_response' | 'client_resume';
  roomDigest: string;
  taskFrame: {
    objective: string;
    stage: string;
    stakeholders: string[];
  };
  blockers: string[];
  requiresClarification: boolean;
  clarificationQuestion?: string;
  candidateActions: Array<{
    title: string;
    rationale: string;
    kind: 'reply_first' | 'resume_first' | 'dependency_first';
  }>;
  meta: AiOperationMeta;
}
```

### 4.2 AiActionResponse

```ts
type AiActionResponse = {
  chosenAction: {
    title: string;
    rationale: string;
    successSignal: string;
  };
  alternatives: Array<{
    title: string;
    rationale: string;
  }>;
  whyThisNow: string;
  replyDraft?: string;
  situationSummary: string;
  meta: AiOperationMeta;
}
```

### 4.3 AiScaffoldResponse

```ts
type AiScaffoldResponse = {
  planTitle: string;
  steps: Array<{
    id: string;
    text: string;
    expectedOutcome?: string;
    canAutoDraft?: boolean;
  }>;
  shortcutOptions: string[];
  revisedCurrentStepIndex: number;
  meta: AiOperationMeta;
}
```

### 4.4 AiRescueResponse

```ts
type AiRescueResponse = {
  diagnosis: {
    primaryReason: 'missing_context' | 'dependency' | 'unclear_scope' | 'too_big' | 'low_energy' | 'unknown';
    explanation: string;
  };
  rescuePlan: {
    mode: 'clarify' | 'follow_up' | 'shrink' | 'switch_track' | 'pause_cleanly';
    steps: string[];
  };
  suggestedMessage?: string;
  meta: AiOperationMeta;
}
```

### 4.5 AiReentryResponse

```ts
type AiReentryResponse = {
  reentrySummary: string;
  topActions: Array<{
    roomId: string;
    title: string;
    rationale: string;
    impact: 'high' | 'medium';
    effort: 'low' | 'medium';
  }>;
  ignoredNoise: string[];
  meta: AiOperationMeta;
}
```

---

## 5. TaskContext Extensions

ขยาย `TaskContext` ให้รองรับ AI lifecycle ใหม่:

```ts
interface TaskContext {
  // existing fields remain
  taskFrame?: {
    objective: string;
    stage: string;
    stakeholders: string[];
  };
  currentPlan?: {
    actionTitle: string;
    successSignal: string;
    steps: Array<{
      id: string;
      text: string;
      expectedOutcome?: string;
      canAutoDraft?: boolean;
    }>;
  };
  rescueHistory: Array<{
    reason: 'missing_context' | 'dependency' | 'unclear_scope' | 'too_big' | 'low_energy' | 'unknown';
    mode: 'clarify' | 'follow_up' | 'shrink' | 'switch_track' | 'pause_cleanly';
    createdAt: number;
  }>;
  constraints?: {
    timeBudgetMin?: number;
    energyLevel?: 'low' | 'medium' | 'high';
    preferReplyFirst?: boolean;
  };
  reentryBrief?: {
    summary: string;
    topActions: AiReentryResponse['topActions'];
    createdAt: number;
  };
  lastAiOperation?: 'intake' | 'action' | 'scaffold' | 'rescue' | 'reentry';
  assistantMode?: 'intake_review' | 'action_negotiation' | 'scaffold_refinement' | 'rescue_diagnosis' | 'reentry_brief';
}
```

กฎ:
- `TaskContext` ยังเป็น room-scoped context container
- ห้ามใช้ field เหล่านี้เพื่อเปลี่ยน MIND ให้เป็น multi-project planner
- room หนึ่งยังผูกกับงานเดียว

---

## 6. Frontend State and Orchestration

### 6.1 Top-level route policy

คง `uiRoute` ใหญ่ไว้แบบ lean:
- `DUMP_ENTRY`
- `SYNTHESIZING`
- `ONE_ACTION`
- `SCAFFOLD`
- `RESCUE`
- `BOUNCE_BACK`
- `MANUAL_FALLBACK`

ห้ามแตก top-level routes เพิ่มตาม AI operation โดยตรง

### 6.2 Subphase policy

behavior ละเอียดของ AI ให้ควบคุมด้วย `assistantMode` ใน task:
- `intake_review`
- `action_negotiation`
- `scaffold_refinement`
- `rescue_diagnosis`
- `reentry_brief`

ตัวอย่าง:
- `uiRoute = ONE_ACTION` + `assistantMode = action_negotiation`
- `uiRoute = SCAFFOLD` + `assistantMode = scaffold_refinement`
- `uiRoute = RESCUE` + `assistantMode = rescue_diagnosis`

### 6.3 Orchestration policy

ย้าย state transition logic ออกจาก `page.tsx` ไป orchestration layer:
- `task-machine.ts`
- `task-events.ts`

`page.tsx` ควรเหลือหน้าที่:
- render route shell
- hydrate session/task
- mount overlays
- delegate events ไป orchestration layer

orchestration layer ควรรับผิดชอบ:
- transition ระหว่าง route + assistantMode
- เตรียม input สำหรับ AI operation
- เรียก API route ที่ถูกต้อง
- persist task changes
- handle fallback/retry/recovery

---

## 7. UX Rules for AI Copilot

### 7.1 Interaction model

ใช้ embedded copilot model:
- main canvas = งาน/room ปัจจุบัน
- AI = panel หรือ assistant layer ของ phase ปัจจุบัน
- หลีกเลี่ยง empty chat-first UI

### 7.2 ONE_ACTION requirements

ONE_ACTION ต้องรองรับ:
- `ใช้เลย`
- `ปรับใหม่`
- `เล็กลง`
- `เร็วขึ้น`
- `ปลอดภัยขึ้น`
- `ตอบลูกค้าก่อน`
- `เริ่มงานก่อน`
- `ทำไมแนะนำแบบนี้`

### 7.3 SCAFFOLD requirements

SCAFFOLD ต้องรองรับ:
- living steps ไม่ใช่ static micro steps อย่างเดียว
- current step refinement
- shortcut suggestion
- optional draft artifact per step

### 7.4 RESCUE requirements

RESCUE ต้องแสดง:
- diagnosis ที่ชัดเจน
- rescue mode ที่เลือกได้
- suggested message ถ้าเกี่ยวกับ dependency/follow-up

### 7.5 REENTRY requirements

BOUNCE_BACK / MORNING_RITUAL ต้องแสดง:
- reentry summary
- สิ่งที่ควร ignore วันนี้
- top 1–3 next actions
- recommended room to open first

### 7.6 Trust loop

ทุก phase ที่ AI มี output ควรมีองค์ประกอบต่อไปนี้ถ้าเหมาะกับบริบท:
- why this
- what changed
- confidence / uncertainty
- lightweight provenance เช่น “ใช้ข้อมูลจาก 2 ไฟล์ใน room นี้”

---

## 8. Acceptance Criteria

### 8.1 Architecture
- ไม่มี single `/api/ai` route ที่รับผิดชอบทุก operation หลักเพียงตัวเดียวอีกต่อไป
- `page.tsx` ไม่เป็น state controller หลักของทุก flow
- orchestration layer เป็นผู้เลือก AI operation และ persist task state

### 8.2 Product behavior
- Intake ไม่จบที่ summary อย่างเดียว แต่มี `taskFrame` และ candidate actions
- ONE_ACTION รองรับ negotiation ที่มีผลต่อ output จริง
- `ย่อยให้เล็กลงอีก` ใช้ AI scaffold refine จริง
- RESCUE แสดง diagnosis และ rescue plan ตามเหตุที่ติด
- BOUNCE_BACK / MORNING_RITUAL มี reentry brief จาก AI

### 8.3 Guardrails
- room context ไม่ไหลข้าม task
- local-only และ honest recovery ยังคงอยู่
- MIND ไม่ drift ไปเป็น planner, workspace, หรือ file manager

---

## 9. Implementation Order

ลำดับที่ต้องทำ:
1. split AI operations + contracts
2. move orchestration out of `page.tsx`
3. make scaffold refinement AI-backed
4. make rescue diagnosis first-class
5. make reentry brief first-class
6. polish onboarding and narrative after behavior is real

เอกสารนี้ตั้งใจเป็น addendum เชิง architecture และ AI behavior โดยไม่แทนที่ PRD หลัก
