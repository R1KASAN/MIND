import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreferredRoomSourceContext,
  describeRoomFileFailureReason,
  getRoomSourceIdForFile,
  getRoomFileUxCopy,
  type RoomSourceFile,
} from './room';

test('getRoomFileUxCopy maps the three UX states', () => {
  const pending = getRoomFileUxCopy({ status: 'pending', failureReason: 'file_extraction_pending' });
  assert.equal(pending.state, 'pending');
  assert.equal(pending.title, 'กำลังสกัดข้อความ');
  assert.equal(pending.cta, 'กำลังอ่านไฟล์');

  const ready = getRoomFileUxCopy({ status: 'ready', failureReason: undefined });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.title, 'อ่านไฟล์ได้แล้ว');
  assert.equal(ready.cta, 'ใช้บริบทนี้ต่อ');

  const failed = getRoomFileUxCopy('pdf_ocr_failed');
  assert.equal(failed.state, 'ocr_failed');
  assert.equal(failed.title, 'อ่านไม่สำเร็จ');
  assert.equal(failed.body, 'MIND ลองอ่านไฟล์นี้แล้ว แต่ยังดึงข้อความออกมาใช้ไม่ได้');

  const garbled = getRoomFileUxCopy('pdf_text_garbled_after_ocr');
  assert.equal(garbled.state, 'ocr_garbled');
  assert.equal(garbled.title, 'อ่านได้ไม่ชัดพอ');
  assert.equal(garbled.cta, 'ลองอ่านไฟล์อีกครั้ง');
});

test('describeRoomFileFailureReason preserves concise labels for file warnings', () => {
  assert.equal(describeRoomFileFailureReason('pdf_ocr_failed'), 'ลอง OCR แล้วแต่ยังอ่านข้อความไม่สำเร็จ');
  assert.equal(describeRoomFileFailureReason('pdf_text_garbled_after_ocr'), 'ลอง OCR แล้วแต่ข้อความยังไม่ชัดพอ');
  assert.equal(describeRoomFileFailureReason('unsupported_file_type'), 'ชนิดไฟล์นี้ยังไม่รองรับ');
});

test('getRoomFileUxCopy accepts full file records', () => {
  const file: RoomSourceFile = {
    id: 'file-1',
    name: 'mind-demo-brief.pdf',
    kind: 'pdf',
    mimeType: 'application/pdf',
    size: 1024,
    status: 'unreadable',
    createdAt: 10,
    failureReason: 'pdf_text_garbled_after_ocr',
  };

  const copy = getRoomFileUxCopy(file);
  assert.equal(copy.state, 'ocr_garbled');
  assert.match(copy.detail, /สแกนหรือภาพ/);
});

test('buildPreferredRoomSourceContext does not merge multiple ready files without primary selection', () => {
  const files: RoomSourceFile[] = [
    {
      id: 'brief-a',
      name: 'brief-a.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      size: 1200,
      status: 'ready',
      createdAt: 1,
      extractedText: 'ข้อความจากไฟล์ A',
    },
    {
      id: 'brief-b',
      name: 'brief-b.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      size: 1300,
      status: 'ready',
      createdAt: 2,
      extractedText: 'ข้อความจากไฟล์ B',
    },
  ];

  const context = buildPreferredRoomSourceContext('ข้อความเดิม', files);

  assert.equal(context.needsPrimarySelection, true);
  assert.equal(context.extractedText, '');
  assert.equal(context.primaryFile, undefined);
  assert.match(context.sourceText, /ไฟล์แนบ:/);
  assert.doesNotMatch(context.sourceText, /ข้อความจากไฟล์ A/);
  assert.doesNotMatch(context.sourceText, /ข้อความจากไฟล์ B/);
});

test('buildPreferredRoomSourceContext uses only the selected primary ready file', () => {
  const files: RoomSourceFile[] = [
    {
      id: 'brief-a',
      name: 'brief-a.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      size: 1200,
      status: 'ready',
      createdAt: 1,
      extractedText: 'ข้อความจากไฟล์ A',
    },
    {
      id: 'brief-b',
      name: 'brief-b.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      size: 1300,
      status: 'ready',
      createdAt: 2,
      extractedText: 'ข้อความจากไฟล์ B',
    },
  ];

  const context = buildPreferredRoomSourceContext('ข้อความเดิม', files, {
    primarySourceId: getRoomSourceIdForFile('brief-b'),
    selectedAt: 10,
    selectedBy: 'user',
  });

  assert.equal(context.needsPrimarySelection, false);
  assert.equal(context.primaryFile?.id, 'brief-b');
  assert.equal(context.extractedText, 'ข้อความจากไฟล์ B');
  assert.match(context.sourceText, /ข้อความจากไฟล์ B/);
  assert.doesNotMatch(context.sourceText, /ข้อความจากไฟล์ A/);
});

test('buildPreferredRoomSourceContext keeps unreadable file text out of source context', () => {
  const files: RoomSourceFile[] = [
    {
      id: 'scan',
      name: 'scan.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      size: 1200,
      status: 'unreadable',
      createdAt: 1,
      extractedText: 'M I N D D E M O g a r b l e d',
      failureReason: 'pdf_text_garbled_after_ocr',
    },
  ];

  const context = buildPreferredRoomSourceContext('ข้อความเดิม', files);

  assert.match(context.sourceText, /scan.pdf/);
  assert.match(context.sourceText, /ลอง OCR แล้วแต่ข้อความยังไม่ชัดพอ/);
  assert.doesNotMatch(context.sourceText, /M I N D D E M O/);
  assert.equal(context.extractedText, '');
});
