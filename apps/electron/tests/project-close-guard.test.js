'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createProjectCloseGuard } = require('../src/project-close-guard');

function createHarness({
  state,
  stateAfterSave = state ? { ...state, dirty: false } : state,
  choice = 'cancel',
  saveResult = { ok: true },
} = {}) {
  const calls = [];
  let inspectionCount = 0;
  const guard = createProjectCloseGuard({
    inspect: async () => {
      calls.push('inspect');
      inspectionCount += 1;
      return inspectionCount === 1 ? state : stateAfterSave;
    },
    prompt: async () => {
      calls.push('prompt');
      return choice;
    },
    save: async () => {
      calls.push('save');
      return saveResult;
    },
    close: () => calls.push('close'),
    reportError: (message) => calls.push(`error:${message}`),
  });
  return { calls, guard };
}

test('clean and automatically saved projects close without prompting', async () => {
  for (const state of [
    { handled: false },
    { handled: true, dirty: false, autoSaved: false },
    { handled: true, dirty: true, autoSaved: true },
  ]) {
    const { calls, guard } = createHarness({ state });
    assert.equal(await guard.requestClose(), 'closed');
    assert.deepEqual(calls, ['inspect', 'close']);
  }
});

test('dirty file project closes after saving', async () => {
  const { calls, guard } = createHarness({
    state: { handled: true, dirty: true, filePath: 'D:/projects/demo.json' },
    choice: 'save',
  });

  assert.equal(await guard.requestClose(), 'closed');
  assert.deepEqual(calls, ['inspect', 'prompt', 'save', 'inspect', 'close']);
});

test('dirty project can be discarded or kept open', async () => {
  const dirty = { handled: true, dirty: true, projectName: 'Demo' };
  const discard = createHarness({ state: dirty, choice: 'discard' });
  const cancel = createHarness({ state: dirty, choice: 'cancel' });

  assert.equal(await discard.guard.requestClose(), 'closed');
  assert.deepEqual(discard.calls, ['inspect', 'prompt', 'close']);
  assert.equal(await cancel.guard.requestClose(), 'canceled');
  assert.deepEqual(cancel.calls, ['inspect', 'prompt']);
});

test('canceled or failed saves keep the project open', async () => {
  const dirty = { handled: true, dirty: true };
  const canceled = createHarness({
    state: dirty,
    choice: 'save',
    saveResult: { ok: false, canceled: true },
  });
  const failed = createHarness({
    state: dirty,
    choice: 'save',
    saveResult: { ok: false, message: 'disk full' },
  });

  assert.equal(await canceled.guard.requestClose(), 'canceled');
  assert.deepEqual(canceled.calls, ['inspect', 'prompt', 'save']);
  assert.equal(await failed.guard.requestClose(), 'failed');
  assert.deepEqual(failed.calls, ['inspect', 'prompt', 'save', 'error:disk full']);
});

test('renderer inspection errors keep the project open', async () => {
  const { calls, guard } = createHarness({
    state: { ok: false, message: 'invalid project state' },
  });

  assert.equal(await guard.requestClose(), 'failed');
  assert.deepEqual(calls, ['inspect', 'error:invalid project state']);
});

test('edits made while saving keep the project open', async () => {
  const dirty = { handled: true, dirty: true, projectName: 'Demo' };
  const { calls, guard } = createHarness({
    state: dirty,
    stateAfterSave: dirty,
    choice: 'save',
  });

  assert.equal(await guard.requestClose(), 'failed');
  assert.deepEqual(calls, [
    'inspect',
    'prompt',
    'save',
    'inspect',
    'error:项目在保存期间又发生了更改，请再次退出。',
  ]);
});

test('repeated close requests share one in-flight decision', async () => {
  let releaseInspect;
  const calls = [];
  const guard = createProjectCloseGuard({
    inspect: () => new Promise((resolve) => {
      calls.push('inspect');
      releaseInspect = resolve;
    }),
    prompt: async () => 'discard',
    save: async () => ({ ok: true }),
    close: () => calls.push('close'),
    reportError: () => {},
  });

  const first = guard.requestClose();
  const second = guard.requestClose();
  assert.equal(first, second);
  releaseInspect({ handled: true, dirty: false });
  assert.equal(await first, 'closed');
  assert.deepEqual(calls, ['inspect', 'close']);
});
