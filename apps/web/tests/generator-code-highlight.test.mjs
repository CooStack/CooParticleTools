import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { highlightKotlin } from '../src/utils/legacy-code-highlight.js';

test('Kotlin highlighter escapes source and emits syntax tokens', () => {
  const highlighted = highlightKotlin('class Demo { val text = "<script>"; fun run() = 12 }');

  assert.match(highlighted, /class="tok-kw">class<\/span>/);
  assert.match(highlighted, /class="tok-type">Demo<\/span>/);
  assert.match(highlighted, /class="tok-str">"&lt;script&gt;"<\/span>/);
  assert.match(highlighted, /class="tok-fn">run<\/span>/);
  assert.match(highlighted, /class="tok-num">12<\/span>/);
  assert.doesNotMatch(highlighted, /<script>/);
});

test('Generator code page renders highlighted Kotlin with scoped token styles', async () => {
  const source = await readFile(
    new URL('../src/pages/GeneratorPage.vue', import.meta.url),
    'utf8'
  );

  assert.match(source, /import \{ highlightKotlin \} from '\.\.\/utils\/legacy-code-highlight\.js';/);
  assert.match(source, /const highlightedKotlinOutput = computed\(\(\) => highlightKotlin\(kotlinOutput\.value\)\);/);
  assert.match(source, /<code v-html="highlightedKotlinOutput"><\/code>/);
  for (const token of ['kw', 'str', 'com', 'num', 'fn', 'type']) {
    assert.match(source, new RegExp(`\\.kotlin-output :deep\\(\\.tok-${token}\\)`));
  }
  assert.match(source, /\.code-panel-wide \{[\s\S]*?min-width: 0;/);
  assert.match(source, /\.kotlin-output \{[\s\S]*?min-width: 0;/);
});
