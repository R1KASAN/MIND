import test from 'node:test';
import assert from 'node:assert/strict';

import type { AppSession } from '@/lib/store/idb';
import {
  migrateLegacyActiveDumpContext,
  parseBootstrapFlags,
  resolveBootstrapSession,
} from '@/lib/orchestrator/app-bootstrap';

function createSession(overrides: Partial<AppSession> = {}): AppSession {
  return {
    lastActive: Date.UTC(2026, 3, 13, 1, 0, 0),
    uiRoute: 'DUMP_ENTRY',
    status: 'DUMP_ENTRY',
    notThisCount: 0,
    currentActionId: null,
    hasSeenWalkthrough: false,
    hasSeenResetNotice: true,
    ...overrides,
  };
}

test('stale session resolves to BOUNCE_BACK', () => {
  const session = createSession({
    uiRoute: 'ONE_ACTION',
    status: 'ONE_ACTION',
    lastActive: Date.UTC(2026, 3, 11, 1, 0, 0),
  });

  const resolved = resolveBootstrapSession(session, {
    skipWalkthrough: false,
    skipMorningRitual: false,
    today: '2026-04-13',
    now: Date.UTC(2026, 3, 13, 1, 0, 0),
  });

  assert.equal(resolved.interceptRoute, 'BOUNCE_BACK');
  assert.equal(resolved.session.uiRoute, 'BOUNCE_BACK');
  assert.equal(resolved.showWalkthrough, false);
});

test('same-day fresh dump resolves to MORNING_RITUAL', () => {
  const session = createSession({
    lastMorningShown: '2026-04-12',
  });

  const resolved = resolveBootstrapSession(session, {
    skipWalkthrough: false,
    skipMorningRitual: false,
    today: '2026-04-13',
    now: Date.UTC(2026, 3, 13, 1, 0, 0),
  });

  assert.equal(resolved.interceptRoute, 'MORNING_RITUAL');
  assert.equal(resolved.session.uiRoute, 'MORNING_RITUAL');
});

test('stale beats morning ritual', () => {
  const session = createSession({
    lastMorningShown: '2026-04-12',
    lastActive: Date.UTC(2026, 3, 11, 1, 0, 0),
    uiRoute: 'ONE_ACTION',
    status: 'ONE_ACTION',
  });

  const resolved = resolveBootstrapSession(session, {
    skipWalkthrough: false,
    skipMorningRitual: false,
    today: '2026-04-13',
    now: Date.UTC(2026, 3, 13, 1, 0, 0),
  });

  assert.equal(resolved.interceptRoute, 'BOUNCE_BACK');
  assert.equal(resolved.session.uiRoute, 'BOUNCE_BACK');
});

test('walkthrough=off suppresses overlay', () => {
  const session = createSession();

  const resolved = resolveBootstrapSession(session, {
    skipWalkthrough: true,
    skipMorningRitual: true,
    today: '2026-04-13',
    now: Date.UTC(2026, 3, 13, 1, 0, 0),
  });

  assert.equal(resolved.showWalkthrough, false);
});

test('presentation mode flags do not re-enable walkthrough when walkthrough=off', () => {
  const flags = parseBootstrapFlags(new URLSearchParams('demo=presentation&walkthrough=off'));
  const session = createSession();

  const resolved = resolveBootstrapSession(session, {
    skipWalkthrough: flags.skipWalkthrough,
    skipMorningRitual: flags.skipMorningRitual,
    today: '2026-04-13',
    now: Date.UTC(2026, 3, 13, 1, 0, 0),
  });

  assert.equal(flags.isPresentationMode, true);
  assert.equal(resolved.showWalkthrough, false);
});

test('legacy dump context migrates to structured shape', () => {
  const session = createSession();
  const migrated = migrateLegacyActiveDumpContext({
    ...session,
    activeDumpContext: 'Legacy dump text',
  } as AppSession);

  assert.ok(migrated);
  assert.deepEqual(migrated?.activeDumpContext, {
    text: 'Legacy dump text',
    createdAt: session.lastActive,
  });
});
