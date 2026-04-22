import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MetadataOnlyRetrievalEngine,
  shouldUseRicherRetrieval,
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

