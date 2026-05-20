import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.MIND_BASE_URL || 'http://127.0.0.1:3000';
const SCREENSHOT_DIR = '/tmp/mind-verify';
const UI_TIMEOUT_MS = 60000; // 60s since LLM can take time

async function ensureDirectory(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function run() {
  console.log(`Starting E2E verification targeting ${BASE_URL}...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  page.setDefaultTimeout(UI_TIMEOUT_MS);

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.name}: ${err.message}`);
  });

  try {
    // 1. Open the page
    const initialUrl = `${BASE_URL}/?demo=presentation&scenario=restart&walkthrough=off&ritual=off`;
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.length > 0, undefined, { timeout: UI_TIMEOUT_MS });
    console.log('App loaded.');

    // Close walkthrough popup if visible
    const walkthroughCloseButton = page.getByRole('button', { name: '✕' });
    if (await walkthroughCloseButton.isVisible().catch(() => false)) {
      await walkthroughCloseButton.click();
      console.log('Walkthrough closed.');
    }

    // 2. Click "ห้องใหม่" to start with a fresh room
    const createRoomButton = page.getByLabel('สร้างห้องใหม่');
    await createRoomButton.click();
    console.log('Created a new room.');
    await page.waitForTimeout(1000);

    // 3. Locate brain dump textarea and type the test context
    const textarea = page.locator('#brain-dump-text');
    await textarea.waitFor({ state: 'visible' });
    
    const dumpText = `ลูกค้า ABC Corp ทวงงานค้างสองตัวในแชต ไลน์กลุ่มก็เด้งไม่หยุด
เรื่องเซิร์ฟเวอร์โปรดักชันล่มเมื่อเช้ายังไม่ได้ตรวจดูละเอียดเลย
ทีมงานมาถามหารายละเอียดสเปกปุ่มที่จะส่งบ่ายนี้ด้วย
แถมสไลด์พรีเซนต์ลูกค้าบ่ายสองยังโล่งอยู่เลย สมองตื้อไปหมด
ไม่รู้จะเริ่มเปิดโปรแกรมไหนก่อนดี หิวข้าวก็หิวแต่ยังไม่ได้กินเลย
[FORCE_CLARIFICATION]`;

    await textarea.fill(dumpText);
    console.log('Filled brain dump text.');

    // 4. Click "ไปต่อ" to submit intake
    const submitButton = page.getByRole('button', { name: 'ไปต่อ' });
    await submitButton.click();
    console.log('Submitted brain dump, waiting for clarification screen...');

    // 5. Wait for the clarification screen to appear
    const clarificationInput = page.locator('#clarification-answer');
    await clarificationInput.waitFor({ state: 'visible', timeout: 60000 });
    console.log('Clarification screen appeared successfully.');

    // Take screenshot of clarification state
    await ensureDirectory(`${SCREENSHOT_DIR}/clarification.png`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/clarification.png` });
    console.log(`Clarification screenshot saved to ${SCREENSHOT_DIR}/clarification.png`);

    // 6. Fill clarification answer
    const answerText = `(1) งานค้างคือดีไซน์หน้า Dashboard ที่ยังไม่เสร็จ กับอัปเดต API endpoint ระบบจ่ายเงิน
    (2) เซิร์ฟเวอร์ล่มจาก CPU spike 100% ตอน 9 โมงเช้า ยังไม่มี RCA
    (3) สเปกปุ่มไม่มีเอกสาร เอาเป็นปุ่มสีฟ้าธรรมดาแบบแอปอื่นไปก่อนเลย`;
    await clarificationInput.fill(answerText);
    console.log('Filled clarification answer.');

    // 7. Click "สรุปต่อเลย"
    const nextButton = page.getByRole('button', { name: 'สรุปต่อเลย' });
    await nextButton.click();
    console.log('Submitted clarification answer, waiting for ONE_ACTION screen...');

    // 8. Confirm direct transition to ONE_ACTION (No repeating clarification loop!)
    const primaryButton = page.getByRole('button', { name: 'ฉันติดขัด / ช่วยวินิจฉัยจุดที่บล็อกอยู่' });
    
    // We wait for the "ฉันติดขัด / ช่วยวินิจฉัยจุดที่บล็อกอยู่" button to appear, which only exists on ONE_ACTION/Scaffold screen
    await primaryButton.waitFor({ state: 'visible', timeout: 60000 });
    console.log('Successfully transitioned to ONE_ACTION screen without looping back to clarification!');

    // Assert clarification appears at most once (now hidden)
    const isClarificationHidden = await page.locator('#clarification-answer').isHidden();
    if (!isClarificationHidden) {
      throw new Error('Clarification screen is still visible after transitioning to ONE_ACTION!');
    }
    console.log('Clarification input is hidden as expected.');

    // Assert ONE_ACTION has: context-matching summary, actionable next step (title & rationale), primary CTA, alternatives, and evidence link
    const summaryText = await page.locator('.supporting-summary').first().textContent();
    console.log(`Summary text content: ${summaryText}`);
    const matchesContext = summaryText && (
      summaryText.includes('ABC Corp') ||
      summaryText.includes('เซิร์ฟเวอร์') ||
      summaryText.includes('Dashboard') ||
      summaryText.includes('ล่ม')
    );
    if (!matchesContext) {
      throw new Error('ONE_ACTION situation summary does not match dump context!');
    }
    console.log('ONE_ACTION context-matching summary asserted successfully.');

    const actionTitle = await page.locator('.action-hero-title').textContent();
    const actionRationale = await page.locator('.action-hero-rationale').textContent();
    console.log(`Action Title: ${actionTitle}`);
    console.log(`Action Rationale: ${actionRationale}`);
    if (!actionTitle || actionTitle.trim().length === 0) {
      throw new Error('ONE_ACTION recommended action title is empty!');
    }
    if (!actionRationale || actionRationale.trim().length === 0) {
      throw new Error('ONE_ACTION recommended action rationale is empty!');
    }
    console.log('Action title and rationale are present and non-empty.');

    const primaryCTA = page.getByRole('button', { name: 'ใช้ก้าวนี้' });
    await primaryCTA.waitFor({ state: 'visible' });
    console.log('Primary CTA "ใช้ก้าวนี้" is present and visible.');

    const alternativesSummary = page.getByText('ย่อยก้าวนี้ให้เล็กลง / ปรับเปลี่ยนก้าวนี้');
    await alternativesSummary.waitFor({ state: 'visible' });
    const tenMinBtn = page.getByRole('button', { name: '10 นาที' });
    await tenMinBtn.waitFor({ state: 'visible' });
    console.log('Alternatives section and "10 นาที" button are present.');

    // Expand the sub-details "ตัวเลือกการย่อยขั้นตอนเพิ่มเติม" to reveal "เล็กลง"
    const adjustMoreSummary = page.getByText('ตัวเลือกการย่อยขั้นตอนเพิ่มเติม');
    await adjustMoreSummary.click();
    console.log('Clicked "ปรับเพิ่ม" summary to expand it.');

    const smallerBtn = page.getByRole('button', { name: 'เล็กลง' });
    await smallerBtn.waitFor({ state: 'visible' });
    console.log('Alternatives section and "เล็กลง" button are present.');

    const evidenceLink = page.getByText('ดูที่มาของก้าวนี้');
    await evidenceLink.waitFor({ state: 'visible' });
    console.log('Evidence link "ดูที่มาของก้าวนี้" is visible.');

    // Click evidence link to expand and assert it reveals source details
    await evidenceLink.click();
    console.log('Clicked evidence link, verifying source context...');
    const evidenceContent = page.locator('.supporting-panel').getByText(/ใช้ข้อความที่คุณวางไว้|ABC Corp|เซิร์ฟเวอร์/).first();
    await evidenceContent.waitFor({ state: 'visible', timeout: 5000 });
    console.log('Grounding evidence content verified.');

    // Take screenshot of ONE_ACTION screen
    await page.screenshot({ path: `${SCREENSHOT_DIR}/one_action.png` });
    console.log(`ONE_ACTION screenshot saved to ${SCREENSHOT_DIR}/one_action.png`);

    // 9. Click "ฉันติดขัด / ช่วยวินิจฉัยจุดที่บล็อกอยู่" (Rescue) to diagnose
    await primaryButton.click();
    console.log('Clicked "ฉันติดขัด / ช่วยวินิจฉัยจุดที่บล็อกอยู่" (Rescue), waiting for Rescue diagnosis screen...');

    // Wait for Rescue diagnosis content
    const rescueHeader = page.getByText('ลองเลือกดูว่า “ติด” เพราะอะไร');
    await rescueHeader.waitFor({ state: 'visible', timeout: 20000 });
    console.log('Rescue diagnosis screen loaded successfully.');

    // Wait for the AI diagnosis text to appear
    const diagnosisLabel = page.getByText('MIND มองว่าติดตรงนี้');
    await diagnosisLabel.waitFor({ state: 'visible', timeout: 20000 });
    console.log('MIND diagnosis received.');

    // Verify diagnosis explanation exists and is non-empty
    const diagnosisText = await page.locator('text=MIND มองว่าติดตรงนี้').locator('xpath=..').locator('p').nth(1).textContent();
    console.log(`Diagnosis explanation: ${diagnosisText}`);
    if (!diagnosisText || diagnosisText.trim().length === 0) {
      throw new Error('Rescue diagnosis explanation is empty!');
    }

    // Verify recommended way out exists
    const rescueStepsLabel = page.getByText('ทางออกที่แนะนำตอนนี้');
    await rescueStepsLabel.waitFor({ state: 'visible' });
    console.log('ทางออกที่แนะนำตอนนี้ is present.');

    // Verify recovery action buttons exist
    const makeSmallerBtn = page.getByRole('button', { name: 'แบ่งก้าวนี้ให้เล็กลง' });
    await makeSmallerBtn.waitFor({ state: 'visible' });
    console.log('Recovery button "แบ่งก้าวนี้ให้เล็กลง" is visible.');

    // Take screenshot of Rescue screen
    await page.screenshot({ path: `${SCREENSHOT_DIR}/rescue.png` });
    console.log(`Rescue screenshot saved to ${SCREENSHOT_DIR}/rescue.png`);

    // 10. Verify Room Reentry restores context
    // Let's copy the current URL (which contains the roomId)
    const currentUrl = page.url();
    console.log(`Current room URL: ${currentUrl}`);

    // Reload the page
    console.log('Reloading the page to test reentry...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    // Wait for page to load and check if we are still on the Rescue or Scaffold screen (based on URL/state)
    await rescueHeader.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Reentry verified: Reloading page preserved the Rescue state/context perfectly!');

    // Check that we did NOT return to DUMP_ENTRY
    const dumpTextarea = page.locator('#brain-dump-text');
    const isDumpVisible = await dumpTextarea.isVisible();
    if (isDumpVisible) {
      throw new Error('Reentry failed: returned to DUMP_ENTRY screen!');
    }
    console.log('Reentry verified: DUMP_ENTRY is hidden after reload.');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/reentry_verified.png` });
    console.log('All E2E checks passed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('E2E verification failed:', error);
    try {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/failure.png` });
      console.log(`Failure screenshot saved to ${SCREENSHOT_DIR}/failure.png`);
    } catch (e) {
      console.error('Failed to take failure screenshot:', e);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
