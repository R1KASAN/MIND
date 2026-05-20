import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MetadataOnlyRetrievalEngine,
  MiniSearchRetrievalEngine,
  shouldUseRicherRetrieval,
  tokenizeRoomMemoryText,
} from './engine';

test('shouldUseRicherRetrieval enables richer retrieval for complex rooms', () => {
  assert.equal(shouldUseRicherRetrieval({ sourceItemCount: 31, roomAgeMs: 0 }), true);
  assert.equal(shouldUseRicherRetrieval({ sourceItemCount: 2, roomAgeMs: 1000 * 60 * 60 * 24 * 91 }), true);
  assert.equal(shouldUseRicherRetrieval({ sourceItemCount: 2, roomAgeMs: 0, notLikeThisRate: 0.5 }), true);
  assert.equal(shouldUseRicherRetrieval({ sourceItemCount: 2, roomAgeMs: 0, notLikeThisRate: 0.1 }), false);
});

test('MetadataOnlyRetrievalEngine retrieves room-scoped matching source items', async () => {
  const engine = new MetadataOnlyRetrievalEngine();
  await engine.indexSourceItem({
    id: 'source-1',
    roomId: 'room-a',
    kind: 'note',
    summary: 'Phase 2 budget and payment terms',
    createdAt: 100,
  });
  await engine.indexSourceItem({
    id: 'source-2',
    roomId: 'room-b',
    kind: 'note',
    summary: 'Phase 2 budget and payment terms',
    createdAt: 100,
  });

  const hits = await engine.retrieve('budget payment', 'room-a', 5);

  assert.deepEqual(hits.map((hit) => hit.id), ['source-1']);
});

test('MiniSearchRetrievalEngine retrieves lexical room memory with room isolation', async () => {
  const engine = new MiniSearchRetrievalEngine();
  await engine.indexSourceItem({
    id: 'source-1',
    roomId: 'room-a',
    kind: 'file',
    summary: 'Budget approval and payment milestone for the website scope',
    rawText: 'Client accepted phase two after deposit confirmation.',
    createdAt: Date.now(),
  });
  await engine.indexSourceItem({
    id: 'source-2',
    roomId: 'room-b',
    kind: 'file',
    summary: 'Budget approval and payment milestone for another client',
    createdAt: Date.now(),
  });

  const hits = await engine.retrieveHits('payment milestone', 'room-a', 5);

  assert.deepEqual(hits.map((hit) => hit.item.id), ['source-1']);
  assert.equal(hits[0]?.reason.startsWith('lexical_match:'), true);
});

test('MiniSearchRetrievalEngine tokenizes Thai text beyond whitespace', async () => {
  const engine = new MiniSearchRetrievalEngine();
  await engine.indexSourceItem({
    id: 'source-thai',
    roomId: 'room-thai',
    kind: 'note',
    summary: 'ลูกค้าขอเลื่อนเดดไลน์และยืนยันงบประมาณก่อนเริ่มงาน',
    createdAt: Date.now(),
  });

  const hits = await engine.retrieve('งบประมาณ', 'room-thai', 3);
  const thaiTokens = tokenizeRoomMemoryText('ยืนยันงบประมาณ');

  assert.deepEqual(hits.map((hit) => hit.id), ['source-thai']);
  assert.equal(thaiTokens.length > 1, true);
  assert.equal(thaiTokens.some((token) => token.length > 1), true);
});
