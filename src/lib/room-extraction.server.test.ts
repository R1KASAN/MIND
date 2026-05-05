import test from 'node:test';
import assert from 'node:assert/strict';

import { assessExtractedTextQuality, extractRoomSubmission, normalizeFileText } from './room-extraction.server';

function makePdfFile(name = 'brief.pdf') {
  return new File(['placeholder'], name, { type: 'application/pdf' });
}

test('normalizeFileText strips NUL characters and collapses whitespace', () => {
  const normalized = normalizeFileText('A\u0000\r\n\r\n  B   C\t\tD');
  assert.equal(normalized, 'A\n\nB C D');
});

test('assessExtractedTextQuality flags garbled extracted text', () => {
  const quality = assessExtractedTextQuality('M I N D D E M O ไฟ ล\u0000 ต\u0000 วอ ย\u0000 าง c ont e xt');
  assert.equal(quality.usable, false);
  assert.notEqual(quality.reason, undefined);
});

test('extractRoomSubmission keeps clean text-layer PDF as ready', async () => {
  let ocrCalled = false;
  const submission = await extractRoomSubmission('', [makePdfFile()], {
    extractPdfTextLayer: async () => 'เอกสารสรุป scope และ next move ที่พร้อมใช้',
    extractPdfTextViaOcr: async () => {
      ocrCalled = true;
      return '';
    },
  });

  assert.equal(submission.sourceFiles[0]?.status, 'ready');
  assert.equal(submission.sourceFiles[0]?.extractedText, 'เอกสารสรุป scope และ next move ที่พร้อมใช้');
  assert.equal(submission.sourceText.includes('บริบทจากไฟล์แนบ'), true);
  assert.equal(ocrCalled, false);
});

test('extractRoomSubmission falls back to OCR when PDF text layer is garbled', async () => {
  let receivedMaxPages: number | undefined;
  const submission = await extractRoomSubmission('', [makePdfFile()], {
    extractPdfTextLayer: async () => 'M I N D D E M O ไฟ ล\u0000 ต\u0000 วอ ย\u0000 าง c ont e xt',
    ocrEngineAdapter: {
      name: 'test-ocr',
      extractPdf: async (_file, options) => {
        receivedMaxPages = options.maxPages;
        return {
          text: 'ลูกค้าขอให้สรุปสถานะล่าสุดและยืนยันก้าวถัดไปก่อนสิ้นวัน',
          engine: 'test-ocr',
          metrics: {
            rawTextLength: 64,
            normalizedTextLength: 64,
            fragmentedRunCount: 0,
            spaceDensity: 0.05,
            normalWordRatio: 1,
            pageCountProcessed: 1,
            durationMs: 12,
          },
        };
      },
    },
  });

  assert.equal(receivedMaxPages, 3);
  assert.equal(submission.sourceFiles[0]?.status, 'ready');
  assert.equal(
    submission.sourceFiles[0]?.extractedText,
    'ลูกค้าขอให้สรุปสถานะล่าสุดและยืนยันก้าวถัดไปก่อนสิ้นวัน',
  );
  assert.equal(submission.sourceFiles[0]?.ocrEngine, 'test-ocr');
  assert.equal(submission.sourceFiles[0]?.ocrMetrics?.fragmentedRunCount, 0);
  assert.equal(submission.sourceFiles[0]?.ocrMetrics?.pageCountProcessed, 1);
  assert.equal(submission.extractedText.includes('ยืนยันก้าวถัดไป'), true);
});

test('extractRoomSubmission marks PDF failed when OCR output is still garbled', async () => {
  const submission = await extractRoomSubmission('มีโน้ตเดิมอยู่แล้ว', [makePdfFile()], {
    extractPdfTextLayer: async () => 'M I N D D E M O ไฟ ล\u0000 ต\u0000 วอ ย\u0000 าง c ont e xt',
    extractPdfTextViaOcr: async () => 'ไ ฟ ล ์ ต ั ว อ ย ่ า ง M I N D',
  });

  assert.equal(submission.sourceFiles[0]?.status, 'unreadable');
  assert.equal(submission.sourceFiles[0]?.failureReason, 'pdf_text_garbled_after_ocr');
  assert.equal(submission.sourceFiles[0]?.failureStage, 'pdf_ocr');
  assert.equal(submission.sourceFiles[0]?.failureDetail, 'fragmented_word_runs');
  assert.equal(submission.sourceFiles[0]?.ocrEngine, 'tesseract');
  assert.equal(submission.sourceFiles[0]?.ocrMetrics?.fragmentedRunCount, 1);
  assert.equal(submission.sourceFiles[0]?.extractedText, undefined);
  assert.equal(submission.extractedText, '');
  assert.equal(submission.sourceText.includes('มีโน้ตเดิมอยู่แล้ว'), true);
  assert.equal(submission.sourceText.includes('บริบทจากไฟล์แนบ'), false);
  assert.equal(submission.sourceText.includes('ลอง OCR แล้วแต่ข้อความ PDF ยังไม่ชัดพอ'), true);
});

test('extractRoomSubmission marks PDF failed when OCR runtime fails', async () => {
  const submission = await extractRoomSubmission('', [makePdfFile()], {
    extractPdfTextLayer: async () => 'M I N D D E M O ไฟ ล\u0000 ต\u0000 วอ ย\u0000 าง c ont e xt',
    extractPdfTextViaOcr: async () => {
      throw new Error('pdf_ocr_timeout');
    },
  });

  assert.equal(submission.sourceFiles[0]?.status, 'failed_extraction');
  assert.equal(submission.sourceFiles[0]?.failureReason, 'pdf_ocr_failed');
  assert.equal(submission.sourceFiles[0]?.failureStage, 'pdf_ocr');
  assert.equal(submission.sourceFiles[0]?.failureDetail, 'pdf_ocr_timeout');
  assert.equal(submission.extractedText, '');
  assert.equal(submission.sourceText.includes('ไฟล์แนบ'), true);
});

test('extractRoomSubmission treats markdown demo companion as ready text source', async () => {
  const file = new File(['# Demo\n\nลูกค้าขอเลื่อน timeline และต้องยืนยัน budget ก่อนตอบกลับ'], 'mind-demo-emails.md', {
    type: 'text/markdown',
  });
  const submission = await extractRoomSubmission('', [file]);

  assert.equal(submission.sourceFiles[0]?.status, 'ready');
  assert.equal(submission.sourceFiles[0]?.kind, 'text');
  assert.equal(submission.sourceFiles[0]?.extractedText?.includes('ลูกค้าขอเลื่อน timeline'), true);
  assert.equal(submission.extractedText.includes('ยืนยัน budget'), true);
});
