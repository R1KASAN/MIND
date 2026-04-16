# MIND Research-Backed Workflow Review + UX/UI Refocus

วันที่อ้างอิงสำหรับ repo review: `2026-04-08 00:00` ถึง `2026-04-15 23:59` (Asia/Bangkok)

เอกสารนี้ตั้งใจใช้ตอบได้ทั้ง 2 ภาษาในห้องพรีเซนต์เดียวกัน:

- ภาษา non-technical: painpoint, คุณค่า, workflow ที่เหมาะสุด, และ positioning ในตลาด
- ภาษา technical/วิศวกรรม: constraints, architecture direction, KPI, และระบบในรูปแบบ model

---

## 1. MIND ควรชนะปัญหาอะไรจริง ๆ

ICP ของ MIND ควรถูกบีบให้แคบและคมที่สุด:

- solo client-facing knowledge workers
- งานลูกค้าที่ค้างและเย็นลงง่าย
- context กระจัดกระจายหลายช่องทาง
- ช่วงเวลาที่กลับมาทำงานแบบพลังงานต่ำและไม่อยาก reread ทุกอย่างใหม่

ดังนั้น core job ที่ MIND ต้องชนะไม่ใช่ “ช่วยจัดงานทั้งหมด” แต่คือ:

- “กลับมาแล้วรู้ทันทีว่าอยู่ตรงไหน”
- “มี next move ที่เริ่มได้เลย”
- “ไม่ต้อง reread ทุกอย่าง”

MIND จึงไม่ควรขยายไปเป็น:

- generic PM
- generic note-taking app
- team workspace
- document hub
- chat-first assistant

ถ้าขยายไปเป็นรูปแบบเหล่านี้ MIND จะเสียจุดชนะ เพราะผู้ใช้ไม่ได้ติดปัญหาเรื่อง “เก็บข้อมูลไม่พอ” แต่ติดปัญหาเรื่อง “กลับมาทำต่อไม่ไหว”

### Engineering constraints, solution direction, and why a web app

#### ข้อจำกัดหลักของปัญหา

ภาษาคนทั่วไป:

- ข้อมูลงานหนึ่งชิ้นไม่ได้อยู่ที่เดียว แต่มักแตกไปตาม chat, email, docs, PDFs, screenshots, และโน้ต
- เวลาจะกลับมาทำต่อ ผู้ใช้ไม่ได้มีเวลา 20 นาทีเพื่อไล่อ่านใหม่ทั้งหมด
- ถ้า AI ช้า, offline, หรือ local model ยัง warm up อยู่ ห้องก็ยังต้องใช้งานได้
- งานลูกค้ามีความอ่อนไหว จึงมีแรงกดดันด้าน privacy และ local-first สูง
- ปัญหานี้ไม่ใช่แค่ “หาไฟล์ให้เจอ” แต่คือ “กู้ state ของงานกลับมาให้รู้ว่าควรทำอะไรต่อ”

ภาษาวิศวะ:

- input เป็น fragmented, heterogeneous, multi-channel context
- restart moment มี budget ต่ำ ทั้งในเวลาและ cognitive load
- system ต้อง tolerate partial AI availability ได้
- persistence layer ต้องเก็บ task continuity ไม่ใช่เก็บแค่ artifacts
- UX ต้อง prioritize state recovery over search depth

#### MIND ใช้ solution direction แบบไหน

ใน repo ปัจจุบัน MIND เดินมาถูกทางเมื่อใช้แนวคิดต่อไปนี้เป็นแกน:

- `room-first`: หนึ่ง room = หนึ่งงานลูกค้า / หนึ่งบริบทที่ต้องกลับเข้ามาต่อ
- `save point`: ห้องต้องมี state ล่าสุดที่เชื่อถือได้ ไม่ต้องเริ่มจากศูนย์
- `lastKnownGood*`: ใช้ cached brief และ next moves เป็นตัวพยุง continuity
- `reentry card`: เปิดห้องแล้วต้องเห็นสิ่งที่สรุปให้กลับมาได้ทันที
- `ONE_ACTION`: ก้าวแรกหลัง reentry ต้องถูกบีบให้เหลือ action เดียวที่เริ่มได้จริง
- non-blocking Gemma/local AI: AI refresh เป็น enhancement ไม่ใช่เงื่อนไขเริ่มใช้งาน
- room usability before refresh completes: ถ้า AI ยังไม่ตอบ ห้องก็ยัง usable จาก cached state

#### ทำไม web app เหมาะสุดใน v1

เทียบกับทางเลือกอื่น:

- **browser extension**
  - ข้อดี: อยู่ใกล้ chat/email/web artifacts
  - ข้อเสีย: pain ของ MIND ไม่ได้อยู่ใน browser tab เดียว แต่กินข้าม docs, files, screenshots, notes และการกลับมาทำงานทั้งก้อน
  - สรุป: แคบเกินไปสำหรับ problem shape นี้

- **desktop-only app**
  - ข้อดี: คุม local-first/runtime ได้มาก
  - ข้อเสีย: เพิ่ม friction ด้าน installation, distribution, และ maintenance เร็วเกินไปสำหรับ v1
  - สรุป: อาจมีค่าในอนาคต แต่ยังไม่ใช่ form factor ที่คุ้มสุดตอนนี้

- **mobile-only**
  - ข้อดี: capture เร็ว
  - ข้อเสีย: weak มากสำหรับงานที่จบลงด้วยการ draft, review, compare, reply, หรือ act บน desktop context หลายจอ
  - สรุป: ไม่เหมาะเป็น primary surface สำหรับ ICP นี้

ข้อสรุป:

- web app เหมาะสุดเป็น primary form factor เพราะ workflow จริงของ ICP นี้กระจายอยู่บน web-accessed tools อยู่แล้ว
- มันยังพา MIND ไปสู่ local-first ได้ โดยไม่บังคับผู้ใช้เปลี่ยนพฤติกรรมทั้งหมด
- ในเชิงวิศวะ web app ยังทำให้ state model, deployment path, และ smoke/gate path ตรงกันง่ายกว่า extension-first หรือ desktop-first

#### เป้าหมายผลลัพธ์สูงสุดของระบบ

ในภาษาคนทั่วไป:

- ลดเวลาจาก “กลับมาจำงานเดิม” แบบ reread หลายนาที ให้เหลือ reentry flow สั้น ๆ ที่พาเริ่มได้เลย
- คุม privacy ด้วย local-first path
- ทำให้ห้องมี “usable next move” แม้ AI refresh จะยังไม่เสร็จ

ในภาษาวิศวะ:

- minimize restart latency
- maximize usable cached continuity
- minimize dependency on synchronous AI success
- preserve local trust boundary while keeping task state recoverable

---

## 2. Research synthesis

### Source 1: Sophie Leroy / attention residue + “Ready-to-Resume” plan

อ้างอิง:

- Sophie Leroy และ Theresa M. Glomb, *Tasks Interrupted* ([Organization Science](https://pubsonline.informs.org/doi/10.1287/orsc.2017.1184))

สิ่งที่งานวิจัยนี้พบ:

- เมื่อคนถูก interrupt และคาดว่าจะต้องกลับไปทำงานเดิมภายใต้แรงกดดันเวลา จะเกิด attention residue
- residue นี้ทำให้ perform แย่ลงแม้ตอนย้ายไปทำงานใหม่
- “Ready-to-Resume” plan หรือการจดสั้น ๆ ว่าค้างตรงไหนและจะกลับมาทำอะไรต่อ ช่วยลดผลเสียนี้ได้

ทำไมสำคัญกับ MIND:

- pain ของ MIND ไม่ใช่แค่ “หาของไม่เจอ” แต่คือ residue จากงานค้างที่ยังไม่ถูกปิดทางความคิด
- สิ่งที่ผู้ใช้ต้องการไม่ใช่ summary ยาว แต่คือ checkpoint + next step ที่กลับมาได้ทันที

design rule ที่ตามมา:

- MIND ต้องแสดง `save point` และ `next move` แบบพร้อมใช้ทันที
- room card ต้องทำหน้าที่เป็น machine-generated “Ready-to-Resume” plan
- reentry surface ต้องมาก่อน synthesis/loading state

### Source 2: Work interruptions of office workers (2024)

อ้างอิง:

- Vera B. Rick et al., *Work interruptions of office workers* ([Work, 2024](https://journals.sagepub.com/doi/10.3233/WOR-220684))

สิ่งที่งานวิจัยนี้พบ:

- ความถี่ของ interruptions เชื่อมกับ subjective workload ผ่าน perceived interruption overload
- ยิ่ง primary task ซับซ้อน ผลเสียจาก interruption ยิ่งแรงขึ้น

ทำไมสำคัญกับ MIND:

- งานลูกค้าของ ICP มักเป็นงานซับซ้อนและกำกวม ไม่ใช่งาน routine
- การให้ผู้ใช้ reenter ผ่านหลายจอ หลาย mode หรือหลาย CTA จะยิ่งเพิ่ม interruption overload

design rule ที่ตามมา:

- default room surface ต้องลดการตัดสินใจ
- room ควรเริ่มจาก one clear brief + one main next move
- ไม่ควรบังคับผู้ใช้ไล่ panel หลายชั้นก่อนเริ่ม

### Source 3: Microsoft Work Trend Index / Infinite Workday

อ้างอิง:

- Microsoft WorkLab, *Breaking down the infinite workday* ([Microsoft WorkLab](https://www.microsoft.com/en-us/worklab/work-trend-index/breaking-down-infinite-workday/))

สิ่งที่งานวิจัยนี้พบ:

- พนักงานถูก interrupt ทุก ๆ ประมาณ 2 นาทีระหว่าง core work hours
- workday ถูกแบ่งเป็นชิ้นเล็ก ๆ จาก meetings, chats, emails, และ pings

ทำไมสำคัญกับ MIND:

- ปัญหาของผู้ใช้ไม่ใช่ lack of storage แต่คือ fractured day
- ถ้า MIND ต้องใช้เวลา setup หรือรอ AI มากเกินไป มันจะโดนกลืนหายไปกับ noise แบบเดียวกับเครื่องมืออื่น

design rule ที่ตามมา:

- reentry flow ต้องเร็วกว่าการเปิด email/thread/doc เอง
- health/fallback state ต้องสั้น ชัด และไม่ทำให้ room unusable
- AI refresh ต้องเป็น background enhancement

### Source 4: Asana / work about work

อ้างอิง:

- Asana, *How Work About Work Gets in the Way of Real Work* ([Asana](https://asana.com/resources/wired-next-normal-distributed-work))

สิ่งที่แหล่งนี้บอก:

- knowledge workers ใช้เวลาจำนวนมากกับ “work about work”
- สิ่งที่เสียเวลาคือ chasing updates, searching for information, switching between tools, managing shifting priorities

ทำไมสำคัญกับ MIND:

- งานที่ MIND ควรลดไม่ใช่ “การทำงานจริง” แต่คือภาระรอบงาน เช่น ไถหา context, เปิด artifact หลายอัน, จำว่าค้างตรงไหน

design rule ที่ตามมา:

- KPI หลักต้องวัดการลด reread/reopen/search
- workflow ต้องบีบให้จาก room ไปสู่ `ONE_ACTION` โดยผ่านชั้นกลางน้อยที่สุด

### Source 5: Market fragmentation evidence from Asana

อ้างอิง:

- Asana, *Advanced Search and reporting* ([Asana](https://asana.com/resources/asana-tips-advanced-search-reporting))

สิ่งที่แหล่งนี้ชี้:

- knowledge workers สลับไปมาระหว่างหลาย tools ในวันเดียว

ทำไมสำคัญกับ MIND:

- user journey ที่ดีของ MIND จึงไม่ควรเริ่มด้วย “search everything”
- ต้องเริ่มด้วย “นี่คือ state ของงานนี้ และนี่คือก้าวถัดไป”

design rule ที่ตามมา:

- MIND ควรเป็น task-state recovery layer มากกว่า universal workspace

### Market/product benchmarks and external references

#### 1) Mem

อ้างอิง:

- Mem product page ([Mem](https://get.mem.ai/))
- Mem 2.0 announcement ([Mem Blog](https://get.mem.ai/blog/introducing-mem-2-0))

วิธีแก้ปัญหาของเขา:

- note-first / memory-first
- เน้น capture, organize, retrieve, related context, และ AI chat over notes

เขามี/ไม่มีอะไรเทียบกับ MIND:

- มีความสามารถใกล้เคียงด้าน “bring back related context”
- ไม่มี equivalent ที่ชัดของ `reentry brief + next move card` ในระดับ task-state recovery แบบแคบ
- สิ่งที่เด่นคือ personal memory and note recall มากกว่า resume one client task

จุดที่ MIND ยังชัดกว่า:

- MIND ไม่เริ่มจาก “จำได้ไหมว่า note ไหนเกี่ยว”
- MIND เริ่มจาก “นี่คือ save point ของงานนี้ และนี่คือก้าวที่ควรทำต่อ”

#### 2) Notion AI

อ้างอิง:

- Notion AI overview ([Notion Help](https://www.notion.com/help/category/notion-ai))
- Notion AI workspace/help pages ([Notion Help](https://www.notion.com/help/guides/notion-ai-for-docs))

วิธีแก้ปัญหาของเขา:

- workspace-first
- search, chat, write, extract insights, connectors across apps

เขามี/ไม่มีอะไรเทียบกับ MIND:

- มี AI blocks, action-item extraction, enterprise search, connectors
- ไม่มี dedicated task-scoped `save point + resume CTA` ที่ทำหน้าที่เป็น room-level restart surface โดยตรง
- interaction model ยังอยู่ที่ document/workspace context เป็นหลัก

จุดที่ MIND ยังชัดกว่า:

- MIND มีจุดยืนชัดใน “กลับมาทำงานชิ้นเดิมให้เริ่มต่อได้”
- ไม่พยายามเป็น knowledge workspace ครบวงจร

#### 3) Obsidian + plugins

อ้างอิง:

- About Obsidian ([Obsidian Help](https://help.obsidian.md/obsidian))
- Obsidian Canvas ([Obsidian](https://obsidian.md/canvas))

วิธีแก้ปัญหาของเขา:

- note-first / local-first
- knowledge base, markdown files, plugins, visual linking

เขามี/ไม่มีอะไรเทียบกับ MIND:

- มี local-first และ data ownership ชัด
- มี plugin ecosystem และ visual organization
- แต่ไม่มี default product surface ที่เท่ากับ `reentry brief + one next move` สำหรับงานลูกค้าที่ค้าง

จุดที่ MIND ยังชัดกว่า:

- Obsidian เก่งเรื่อง knowledge ownership
- MIND ควรเก่งเรื่อง task continuity under interruption

#### สรุป benchmark

เครื่องมือในตลาดส่วนใหญ่แก้ pain แบบ:

- search-first
- note-first
- workspace-first
- chat-first

แต่ MIND ควรยืนคนละจุด:

- ไม่ใช่ “better notes”
- ไม่ใช่ “more AI”
- แต่คือ `save-point + resume + one-move-only loop + local-first trust`

---

## 3. Current MIND workflow audit

จาก repo ปัจจุบัน MIND มีโครงที่สอดคล้องกับ research แล้วหลายส่วน:

- room-first entry และ room sidebar ทำให้หนึ่งงานมีขอบเขตชัด
- `lastKnownGood*` ทำหน้าที่เป็น persisted continuity layer
- reentry/save-point card ทำหน้าที่คล้าย `Ready-to-Resume` plan
- Gemma path ถูกทำให้ non-blocking และมี health rail แยก
- `ONE_ACTION` ทำหน้าที่เป็น commitment boundary ที่ดีหลัง reentry

สิ่งที่ match กับ research:

- ห้อง usable ได้ก่อน AI refresh เสร็จ
- cached save point มี priority สูงกว่า transient AI state
- ห้องมี next move 1–3 ข้อ แทนการเปิด list ยาว
- มี path สำหรับ `make smaller` และ rescue เมื่อผู้ใช้ยังไปต่อไม่ไหว

สิ่งที่ยังซ้ำหรือ fragmented:

- มีหลาย resume-adjacent surfaces:
  - room card
  - `BounceBack`
  - `MorningRitual`
  - `ONE_ACTION`
- สิ่งเหล่านี้ล้วนพูดเรื่อง “กลับมาทำต่อ” แต่ยังมีภาษาและ hierarchy ซ้ำกัน

จุดที่ workflow ยังขอให้ผู้ใช้คิดเยอะเกินไป:

- บาง room ยังแยก “ล่าสุดอยู่ตรงไหน” ออกจาก “next move” แบบที่ผู้ใช้ยังต้องตีความเอง
- ถ้า room มี save point แต่ next move ไม่คม ผู้ใช้ยังต้องเดาเองว่าจะกด `continue` เพื่อได้อะไร
- mode transitions ยังทำให้รู้สึกว่ามีหลายประตูเข้าสู่งานเดียวกัน

จุดที่ UI states แข่งกับ core loop:

- `BounceBack` และ `MorningRitual` ยังมี narrative ของตัวเองแยกจาก room card
- ถ้าไม่ได้จัด hierarchy ให้ชัด ผู้ใช้จะไม่แน่ใจว่า “resume จาก room card” หรือ “resume จาก mode screen” ต่างกันอย่างไร
- trust/AI state มีประโยชน์เมื่อช่วยลด anxiety แต่จะรบกวนทันทีถ้ามันกลายเป็น message ที่แข่งกับ next move

ข้อสรุปจาก audit:

- MIND แข็งสุดเมื่อ behave เป็น **save-point + resume system**
- สิ่งที่ต้องระวังคือไม่ให้มันแตกเป็นหลาย flow ที่ล้วนชื่อว่า “reentry”
- spinner หรือ synthesis state ต้องไม่มีวันชนะ cached continuity

---

## 4. Recommended workflow thesis

workflow ที่เหมาะที่สุดสำหรับ pain นี้ในตลาด ไม่ใช่ search-first หรือ chat-first แต่คือ:

1. เปิด room
2. เห็น save point / reentry brief ทันที
3. เลือก one primary next move
4. ไปสู่ `ONE_ACTION`
5. ให้ AI refresh ทำงานด้านหลังเป็น enhancement

### canonical product loop

#### 1) room selection

- ผู้ใช้เลือก room ตามงานลูกค้า ไม่ใช่ตามไฟล์หรือ tool
- sidebar ต้องเล่าด้วย brief + freshness + next move แรก

#### 2) immediate reentry card

- หน้าแรกของ room ต้องเป็น reentry card เสมอถ้ามี save point
- card ต้องตอบ 3 อย่างภายในหนึ่งหน้าจอ:
  - งานนี้คืออะไร
  - ล่าสุดอยู่ตรงไหน
  - next move ที่เริ่มได้เลยคืออะไร

#### 3) one primary CTA

CTA hierarchy ที่ควรล็อก:

- primary: `ต่อจากจุดนี้`
- secondary: `ย่อยให้เล็กลง`
- tertiary / contextual only: `เริ่มใหม่`

เงื่อนไข:

- ถ้ามี save point และมี reentry action -> `continue` ต้องเด่นที่สุด
- `make smaller` แสดงเมื่อใช้เพื่อช่วยเริ่ม ไม่ใช่เป็น default path ของทุก room
- `start fresh` ควรเป็นทางเลือกเมื่อ cached state ไม่เหมาะหรือ user ตั้งใจ reset

#### 4) optional refinement / rescue

- หลังจาก user เข้า `ONE_ACTION` แล้ว ค่อยให้ refinement / rescue เปิดบทบาท
- อย่าโยน rescue หรือ multi-option decision board มาตั้งแต่หน้า room แรก

#### 5) background refresh and trust state

- AI refresh ทำหลังบ้าน
- trust state มีไว้ตอบ “ใช้ข้อมูลไหนอยู่” ไม่ใช่ดึงความสนใจจาก action หลัก

สิ่งที่ไม่ควร block room usability:

- health check ที่ยังไม่เสร็จ
- reentry refresh ที่ยังไม่เสร็จ
- scaffold generation ที่ยังไม่มา
- fallback model state ที่ยัง usable อยู่แล้ว

### Engineering constraints, solution direction, and why a web app

ในเชิง implementation workflow นี้สมเหตุผลเพราะ:

- `room-first + save-point + lastKnownGood*` ทำให้ state machine ของ interruption recovery เสถียร
- local AI แบบ non-blocking ทำให้ room ไม่ต้อง bind กับ synchronous success ของ model call
- `ONE_ACTION` เป็น boundary ที่ดี เพราะเปลี่ยน “resume task” ให้กลายเป็น “resume via one committed next action”
- web app ทำให้ state persistence, route shell, smoke tests, และ local runtime path อยู่ในระบบเดียวกัน

พูดแบบวิศวะ:

- room คือ stable recovery unit
- save point คือ persisted checkpoint
- `lastKnownGood*` คือ continuity cache
- reentry card คือ state projection
- `ONE_ACTION` คือ first executable transition after reentry
- background AI refresh คือ eventual enrichment, not blocking dependency

---

## 5. UX/UI change list

### Landing / room shell — `P0 now`

ปัญหาปัจจุบัน:

- ยังมีหลาย layer ที่ทำหน้าที่คล้ายกันเรื่อง resume
- room shell บางช่วงยังดูเหมือน “container ของหลาย mode” มากกว่า “หน้าเริ่มทำงานต่อ”

exact change:

- ล็อกให้ room shell เริ่มจาก reentry card เป็น default surface เสมอเมื่อมี save point
- ไม่ให้ loading/synthesis card ขึ้นแทน cached room state

เหตุผล:

- สอดคล้องกับ ready-to-resume research
- ลด interruption overload จาก mode-switching

### Reentry card — `P0 now`

ปัญหาปัจจุบัน:

- card ถูกต้องในทิศทางแล้ว แต่บาง room ยังต้องตีความเองว่า “ต่อจากจุดนี้” จะพาไปอะไร

exact change:

- ทำให้ block “Next move” เขียนในรูป action-first มากขึ้น
- ถ้าไม่มี next move ที่คมพอ ให้ card บอกตรง ๆ ว่า `continue` จะพาไป resume state ไหน

เหตุผล:

- ลด cognitive overhead ตอน restart
- ทำให้ card เป็น executable checkpoint ไม่ใช่แค่ summary

### Room sidebar — `P1 next`

ปัญหาปัจจุบัน:

- sidebar เล่า continuity ได้ดี แต่ยังเสี่ยงจะกลายเป็นรายชื่อห้อง + summary เฉย ๆ

exact change:

- ให้ sidebar เน้น 3 สัญญาณเท่านั้น:
  - brief สั้น
  - freshness state
  - next move แรก
- ตัดข้อมูลที่ไม่ได้ช่วยตัดสินใจเลือก room ออก

เหตุผล:

- room selection ต้องเร็วกว่า search/reopen artifacts

### Mode transitions (`BounceBack`, `MorningRitual`, `ONE_ACTION`) — `P0 now`

ปัญหาปัจจุบัน:

- `BounceBack` และ `MorningRitual` ยังเล่าเรื่อง resume ซ้ำกับ room card

exact change:

- ให้สอง mode นี้กลายเป็น thin wrappers รอบ reentry decision เดียวกัน
- language, CTA, และ hierarchy ต้องอิง room card เป็นหลัก
- `ONE_ACTION` ต้องเป็นปลายทางหลักหลังจาก `continue`

เหตุผล:

- ลด duplicated resume logic
- ทำให้ user ไม่ต้องเรียนรู้หลาย resume metaphors

### Trust / AI state messaging — `P1 next`

ปัญหาปัจจุบัน:

- trust state มีประโยชน์ แต่มีโอกาสแย่งความสนใจจาก task state

exact change:

- ให้ AI rail ตอบแค่:
  - ตอนนี้ usable ไหม
  - ใช้ model อะไร
  - cached state ใช้ได้ไหม
- อย่าใช้มันเล่าเรื่อง workflow หลักแทน room card

เหตุผล:

- trust loop ต้อง support resume ไม่ใช่เป็น parallel narrative

### สิ่งที่ไม่ควรทำ

- ขยายเป็น planner
- เพิ่ม chat-first workflow
- เปลี่ยน room ให้เป็น document workspace
- ขยาย team coordination ในรอบนี้

---

## 5.5 Engineering KPIs and system equation

ส่วนนี้ใช้ตอบอาจารย์หรือ reviewer ในภาษาวิศวกรรม ว่าระบบนี้นิยามและวัดผลได้จริง

### KPI หลัก

#### `T_reentry`

นิยาม:

- เวลาเริ่มจากเปิด room จนถึงเริ่ม first real action

ทำไมสำคัญ:

- นี่คือ metric ที่ตรงกับ painpoint หลักที่สุด: “กลับมาจำงานเดิมนานแค่ไหน”

#### `R_card`

นิยาม:

- สัดส่วน session ที่ผู้ใช้ restart ผ่าน reentry card แทนการไล่อ่านเองหรือ search เอง

ทำไมสำคัญ:

- ถ้า metric นี้ไม่ขึ้น แปลว่า card ยังไม่ใช่ default recovery surface จริง

#### `S_one_action`

นิยาม:

- สัดส่วน resumed sessions ที่ผู้ใช้กดใช้หรือยอมรับ `ONE_ACTION`

ทำไมสำคัญ:

- วัดว่า workflow ไม่ได้แค่ summarize ได้ แต่พาไปสู่การลงมือทำได้จริง

#### `N_artifacts`

นิยาม:

- จำนวน artifacts หรือ context sources ที่ user ต้อง reopen ก่อนลงมือ

ทำไมสำคัญ:

- ถ้าเลขนี้ยังสูง แปลว่า MIND ยังไม่ได้ลด work-about-work จริง

#### `A_refresh_visible`

นิยาม:

- สัดส่วน session ที่ cached room state usable ได้ก่อน AI refresh จะเสร็จ

ทำไมสำคัญ:

- วัด non-blocking architecture ในเชิง UX โดยตรง

### system equation

นิยามง่าย ๆ:

`ProductivityGain ≈ f(↓T_reentry, ↓N_artifacts, ↑R_card, ↑S_one_action, ↑A_refresh_visible)`

แปลเป็นภาษาคนทั่วไป:

- MIND มีค่าก็ต่อเมื่อมันทำให้ผู้ใช้กลับมาทำงานต่อได้เร็วขึ้น
- เปิดของน้อยลง
- ไม่ต้อง reread เยอะ
- และมีโอกาสสูงขึ้นที่ “ก้าวแรก” จะถูกใช้จริง

### ทำไม KPI ชุดนี้สอดคล้องกับปัญหา

งานวิจัยเรื่อง interruption, attention residue, และ work-about-work ล้วนชี้ไปที่ปัญหาเดียวกัน:

- คนไม่ได้ล้มเหลวเพราะไม่มีข้อมูล
- แต่ล้มเหลวเพราะต้องเสียพลังไปกับการ reassemble context

ดังนั้นขอบเขตของ MIND ที่บีบให้แคบ:

- ICP แคบ
- room-first loop ชัด
- one-move-only resume

จึงสอดคล้องโดยตรงกับ KPI เหล่านี้ และทำให้ระบบมี “equation” ที่ตรวจสอบได้ ไม่ใช่เป็นเพียง claim ทาง UX

---

## 6. Repo changes: 2026-04-08 to 2026-04-15

- `PRs found: none`
- `Fallback source: local commits`

ช่วงเวลานี้ไม่พบ GitHub PR ใน repo `R1KASAN/MIND` จึงใช้ local commit เป็นแหล่งสรุปแทน

### Commit ที่พบ

- `a2fd7b7 — Implement MIND vNext gates and rescue tuning`

### Theme 1: runtime / gate scripts

สิ่งที่เปลี่ยน:

- เพิ่มและขยาย scripts สำหรับ gate, smoke, benchmark, browser checks, และ local runtime path

risk ที่ grounded:

- review surface กว้าง
- runtime behavior, smoke behavior, และ release criteria ถูกขยับพร้อมกันใน commit เดียว

### Theme 2: AI operation routes / contracts / orchestration

สิ่งที่เปลี่ยน:

- มี route แยกสำหรับ `intake`, `action`, `scaffold`, `rescue`, `reentry`, `health`
- เพิ่ม contracts, prompts, helpers, telemetry, local synthesis, และ task orchestration layer

risk ที่ grounded:

- หลาย abstraction layers ถูกลงพร้อมกัน
- regression baseline กว้าง เพราะเส้นทาง AI และ orchestration เปลี่ยนทั้งชุด

### Theme 3: room / reentry UI surfaces

สิ่งที่เปลี่ยน:

- เพิ่ม room-first UI, recovery surfaces, action/scaffold surfaces, walkthrough, trust overlay, และ studio/debug panels

risk ที่ grounded:

- UX layer มีหลาย surfaces ที่แตะ flow หลักเดียวกัน
- ความเสี่ยงคือ duplicated interaction model ถ้าไม่กำหนด hierarchy ให้ชัด

### Theme 4: specs / docs / runbooks

สิ่งที่เปลี่ยน:

- เพิ่ม docs/specs จำนวนมากใน `specs/001` ถึง `specs/006`, README, AGENTS, และ checklists/runbooks

risk ที่ grounded:

- เอกสาร historical กับเอกสาร active อาจ drift กันได้
- คนในทีมอาจตาม source of truth คนละชุดถ้าไม่ชี้ชัด

### Theme 5: tests / benchmarks / smokes

สิ่งที่เปลี่ยน:

- เพิ่ม tests หลายชั้นสำหรับ AI ops, orchestration, store, studio, และ smoke/benchmark scripts

risk ที่ grounded:

- ถึง coverage กว้างขึ้น แต่ scope ของ commit ก็กว้างมาก
- การแปลผลว่าระบบ “นิ่ง” ยังต้องระวังเพราะหลาย concern ถูก introduce พร้อมกัน

### Repo summary takeaway

ในช่วง `2026-04-08` ถึง `2026-04-15` repo ไม่ได้เปลี่ยนแบบ incremental PR-by-PR แต่เปลี่ยนแบบ large integration commit เดียว

ข้อดี:

- direction ชัด
- room-first + AI operations + gating story ถูกลงเป็นระบบเดียวกัน

ข้อเสี่ยง:

- many layers changed together
- broad review surface
- docs/runtime/UI/specs/tests ถูกขยับพร้อมกัน

ดังนั้นการตัดสินใจเชิง product หลังจากนี้ควร **แคบลง** ไม่ใช่กว้างขึ้น และควรใช้ room-first reentry เป็นแกนตัดสินทุกอย่าง

---

## ข้อสรุปสุดท้าย

workflow ที่เหมาะที่สุดในตลาดสำหรับ pain นี้ไม่ใช่การทำให้ user “ค้นข้อมูลเก่งขึ้น” แต่คือการทำให้ user “กลับเข้าระบบความคิดของงานเดิมได้เร็วขึ้น”

นั่นทำให้ MIND ควรยึดหนึ่งจุดยืนให้ชัด:

- `room-first reentry`
- `save point`
- `one main next move`
- `local-first trust`

ถ้า MIND รักษาขอบเขตนี้ไว้ มันจะต่างจาก Mem, Notion AI, และ Obsidian อย่างชัดเจน:

- เครื่องมือเหล่านั้นเก่งเรื่องเก็บ, หา, หรือคุยกับ knowledge
- MIND ควรเก่งเรื่อง **resume one client task under interruption**

และนั่นคือ pain ที่ยังมีพื้นที่ในตลาด เพราะมันเฉพาะพอจะวัดได้จริงทั้งในภาษาคนทั่วไปและภาษาวิศวกรรม

---

## Sources

- Sophie Leroy, Theresa M. Glomb, *Tasks Interrupted* — [Organization Science](https://pubsonline.informs.org/doi/10.1287/orsc.2017.1184)
- Vera B. Rick et al., *Work interruptions of office workers* — [Work (2024)](https://journals.sagepub.com/doi/10.3233/WOR-220684)
- Microsoft, *Breaking down the infinite workday* — [Microsoft WorkLab](https://www.microsoft.com/en-us/worklab/work-trend-index/breaking-down-infinite-workday/)
- Asana, *How Work About Work Gets in the Way of Real Work* — [Asana](https://asana.com/resources/wired-next-normal-distributed-work)
- Asana, *Advanced Search and reporting* — [Asana](https://asana.com/resources/asana-tips-advanced-search-reporting)
- Mem product page — [Mem](https://get.mem.ai/)
- Mem 2.0 announcement — [Mem Blog](https://get.mem.ai/blog/introducing-mem-2-0)
- Notion AI overview — [Notion Help](https://www.notion.com/help/category/notion-ai)
- Notion AI for docs — [Notion Help](https://www.notion.com/help/guides/notion-ai-for-docs)
- About Obsidian — [Obsidian Help](https://help.obsidian.md/obsidian)
- Obsidian Canvas — [Obsidian](https://obsidian.md/canvas)
