import test from 'node:test';
import assert from 'node:assert/strict';

import { assessExtractedTextQuality, extractRoomSubmission, normalizeFileText } from './room-extraction.server';

function makePdfFile(name = 'brief.pdf') {
  return new File(['placeholder'], name, { type: 'application/pdf' });
}

function makeImageFile(name = 'scan.png') {
  return new File(['placeholder'], name, { type: 'image/png' });
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

test('assessExtractedTextQuality accepts readable Thai text with common 3-character words', () => {
  // Regression for Thai min-length >= 3 threshold:
  // words like งาน, ได้, รับ, ลูก, ออก are 3 chars and must not be penalised.
  const quality = assessExtractedTextQuality(
    'งานนี้ต้องทำให้เสร็จวันนี้ และทีมต้องได้รับข้อมูลจากลูกค้าก่อนที่จะเริ่มออกแบบระบบใหม่ ' +
    'เพราะการรอนานเกินไปทำให้แผนงานทั้งหมดต้องเลื่อนออกไป',
  );
  assert.equal(quality.usable, true);
  assert.equal(quality.metrics.fragmentedRunCount, 0);
});

test('assessExtractedTextQuality accepts mixed Thai-English content', () => {
  // Regression: realistic mixed-script OCR output must not be falsely rejected.
  const quality = assessExtractedTextQuality(
    'ลูกค้าส่ง email มาขอ update สถานะ project ก่อนวันศุกร์ ' +
    'ทีมต้องเตรียม PDF สรุปและส่ง customer update กลับไปภายในวันนี้',
  );
  assert.equal(quality.usable, true);
  assert.equal(quality.metrics.fragmentedRunCount, 0);
});

test('assessExtractedTextQuality accepts numeric-heavy Thai document with meaningful context', () => {
  // Regression: numbers alone must not drag word ratio below threshold when Thai context is present.
  const quality = assessExtractedTextQuality(
    'ราคาแพ็กเกจอยู่ที่ 1,200 บาทต่อเดือน รวม VAT 7% แล้ว ' +
    'มีทั้งหมด 3 แพ็กเกจให้เลือก ลูกค้าต้องยืนยันก่อนวันที่ 15 ของเดือน',
  );
  assert.equal(quality.usable, true);
});

test('assessExtractedTextQuality rejects genuinely fragmented Thai OCR output', () => {
  // Garbled Tesseract output: every Thai character spaced individually,
  // producing fragmented_word_runs and near-zero normalWordRatio.
  const quality = assessExtractedTextQuality(
    'ไ ฟ ล ์ ต ั ว อ ย ่ า ง ท ี่ ถ ู ก ส แ ก น แ ล ้ ว ไ ม ่ ช ั ด เ จ น เ ล ย ส ั ก น ิ ด',
  );
  assert.equal(quality.usable, false);
  assert.ok(quality.metrics.fragmentedRunCount > 0, 'expected fragmented run count > 0');
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
  assert.equal(submission.sourceText.includes('ลอง OCR แล้วแต่ข้อความยังไม่ชัดพอ'), true);
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

test('extractRoomSubmission keeps txt ready when PDF OCR fails', async () => {
  const textFile = new File(['Client asked for Friday deadline and CRM scope confirmation.'], 'client-note.txt', {
    type: 'text/plain',
  });
  const submission = await extractRoomSubmission('', [textFile, makePdfFile('scanned.pdf')], {
    extractPdfTextLayer: async () => '',
    extractPdfTextViaOcr: async () => {
      throw new Error('ocr_unavailable');
    },
  });

  assert.equal(submission.sourceFiles[0]?.status, 'ready');
  assert.equal(submission.sourceFiles[0]?.kind, 'text');
  assert.equal(submission.sourceFiles[0]?.extractedText, 'Client asked for Friday deadline and CRM scope confirmation.');
  assert.equal(submission.sourceFiles[1]?.status, 'failed_extraction');
  assert.equal(submission.sourceFiles[1]?.failureReason, 'pdf_ocr_failed');
  assert.equal(submission.sourceFiles[1]?.failureStage, 'pdf_ocr');
  assert.equal(submission.sourceFiles[1]?.failureDetail, 'ocr_unavailable');
  assert.equal(submission.extractedText, 'Client asked for Friday deadline and CRM scope confirmation.');
  assert.equal(submission.sourceText.includes('บริบทจากไฟล์แนบ'), true);
});

test('extractRoomSubmission extracts image text through OCR adapter', async () => {
  const submission = await extractRoomSubmission('', [makeImageFile()], {
    extractImageText: async () => 'ลูกค้าส่งรูป brief และขอให้ยืนยันขอบเขตงานก่อนเริ่ม',
  });

  assert.equal(submission.sourceFiles[0]?.status, 'ready');
  assert.equal(submission.sourceFiles[0]?.kind, 'image');
  assert.equal(submission.sourceFiles[0]?.extractedText, 'ลูกค้าส่งรูป brief และขอให้ยืนยันขอบเขตงานก่อนเริ่ม');
  assert.equal(submission.sourceFiles[0]?.ocrEngine, 'tesseract');
  assert.equal(submission.extractedText.includes('ยืนยันขอบเขตงาน'), true);
});

test('extractRoomSubmission keeps other files when image OCR fails', async () => {
  const textFile = new File(['Use the pasted launch notes as the source of truth.'], 'launch-notes.md', {
    type: 'text/markdown',
  });
  const submission = await extractRoomSubmission('', [textFile, makeImageFile('receipt.png')], {
    extractImageText: async () => {
      throw new Error('image_ocr_unavailable');
    },
  });

  assert.equal(submission.sourceFiles[0]?.status, 'ready');
  assert.equal(submission.sourceFiles[0]?.extractedText, 'Use the pasted launch notes as the source of truth.');
  assert.equal(submission.sourceFiles[1]?.status, 'failed_extraction');
  assert.equal(submission.sourceFiles[1]?.failureReason, 'image_ocr_failed');
  assert.equal(submission.sourceFiles[1]?.failureStage, 'image_ocr');
  assert.equal(submission.sourceFiles[1]?.failureDetail, 'image_ocr_unavailable');
  assert.equal(submission.extractedText, 'Use the pasted launch notes as the source of truth.');
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
