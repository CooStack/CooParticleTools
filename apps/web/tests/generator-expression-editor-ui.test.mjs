import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyGeneratorExpressionCompletion } from '../src/modules/generator/expression-runtime.js';

const componentUrl = new URL('../src/components/GeneratorExpressionEditor.vue', import.meta.url);

async function readComponent() {
  return readFile(componentUrl, 'utf8');
}

test('doTick editor teleports an accessible listbox and reports validation state', async () => {
  const source = await readComponent();

  assert.match(source, /<Teleport to="body">/);
  assert.match(source, /role="combobox"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /:aria-controls="completionListboxId"/);
  assert.match(source, /:aria-expanded="completionOpen \? 'true' : 'false'"/);
  assert.match(source, /:aria-activedescendant="activeDescendantId \|\| undefined"/);
  assert.match(source, /:aria-invalid="showValidation \? 'true' : 'false'"/);
  assert.match(source, /:aria-describedby="showValidation \? validationMessageId : undefined"/);
  assert.match(source, /Boolean\(props\.validationMessage\) && !completionOpen\.value/);
});

test('doTick editor measures the real caret with a styled textarea mirror', async () => {
  const source = await readComponent();

  assert.match(source, /function measureTextareaCaret\(textarea, style\)/);
  assert.match(source, /document\.createElement\('div'\)/);
  for (const property of ['paddingLeft', 'paddingTop', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'tabSize']) {
    assert.match(source, new RegExp(`'${property}'`));
  }
  assert.match(source, /whiteSpace: textarea\.wrap === 'off' \? 'pre' : 'pre-wrap'/);
  assert.match(source, /markerRect\.left - textarea\.scrollLeft/);
  assert.match(source, /markerRect\.top - textarea\.scrollTop/);
  assert.doesNotMatch(source, /column\s*\*|fontSize\s*\*\s*0\.61/);
  assert.doesNotMatch(source, /CodeMirror/i);
});

test('doTick completion popup has bounded responsive rows and follows keyboard focus', async () => {
  const source = await readComponent();

  assert.match(source, /filterGeneratorExpressionCompletions\(props\.completions, query\.value, 8\)/);
  assert.match(source, /position: fixed/);
  assert.match(source, /Math\.min\(480, Math\.max\(360,/);
  assert.match(source, /grid-auto-rows: 40px/);
  assert.match(source, /height: 40px !important/);
  assert.match(source, /scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(source, /event\.ctrlKey && event\.code === 'Space'/);
  assert.match(source, /event\.key === 'Tab' \|\| event\.key === 'Enter'/);
  assert.match(source, /event\.key === 'Escape'/);
});

test('doTick editor suppresses completion during IME and refreshes click context', async () => {
  const source = await readComponent();

  assert.match(source, /@compositionstart="handleCompositionStart"/);
  assert.match(source, /@compositionend="handleCompositionEnd"/);
  assert.match(source, /isComposing\.value \|\| event\.isComposing \|\| event\.keyCode === 229/);
  assert.match(source, /@click="refreshCompletionContext"/);
  assert.doesNotMatch(source, /@click="closeCompletions"/);
});

test('doTick editor expands a completion replacement through the token suffix', async () => {
  const source = await readComponent();
  const functionSource = source.match(
    /function extendCompletionSelectionEnd\(value, selectionEnd\) \{[\s\S]*?\n\}/
  )?.[0];
  assert.ok(functionSource, 'token boundary helper must remain available in the editor');
  const extendSelectionEnd = Function(
    'value',
    'selectionEnd',
    `${functionSource}; return extendCompletionSelectionEnd(value, selectionEnd);`
  );
  const selectionEnd = extendSelectionEnd('sine', 2);

  assert.equal(selectionEnd, 4);
  assert.deepEqual(
    applyGeneratorExpressionCompletion('sine', 2, selectionEnd, {
      label: 'sin(value)',
      insertText: 'sin(0)',
      cursorOffset: 4,
      selectionLength: 1
    }),
    {
      value: 'sin(0)',
      selectionStart: 4,
      selectionEnd: 5
    }
  );
  assert.match(source, /extendCompletionSelectionEnd\(textarea\.value, textarea\.selectionEnd\)/);
});
