import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as codeEditor from '../public/legacy/assets/composition_builder/js/code_editor.js';
import {
  handleCompositionHistoryShortcut,
  isCompositionTextEditingTarget
} from '../public/legacy/assets/composition_builder/js/history_hotkeys.js';

const codeEditorUrl = new URL('../public/legacy/assets/composition_builder/js/code_editor.js', import.meta.url);
const compositionMainUrl = new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url);
const compositionPresetUrl = new URL('../public/legacy/assets/composition_builder/js/composition_preset_mixin.js', import.meta.url);
const compositionStyleUrl = new URL('../public/legacy/assets/composition_builder/css/style.css', import.meta.url);
const compositionPageUrl = new URL('../public/legacy/composition_builder.html', import.meta.url);

test('Composition completion is offered in code but suppressed in strings and comments', () => {
  assert.equal(typeof codeEditor.isJavaScriptCodeCompletionContext, 'function');

  const isCode = codeEditor.isJavaScriptCodeCompletionContext;
  assert.equal(isCode('addMul', 6), true);
  assert.equal(isCode('"addMul"', 4), false);
  assert.equal(isCode("'addMul'", 4), false);
  assert.equal(isCode('// addMul', 9), false);
  assert.equal(isCode('/* addMul */\nrotate', 20), true);
  const regexThenCode = '/["\']/; addMul';
  assert.equal(isCode(regexThenCode, regexThenCode.indexOf("'") + 1), false);
  assert.equal(isCode(regexThenCode, regexThenCode.length), true);
  const controlledRegex = 'if (ok) /addMul/.test(value)';
  assert.equal(isCode(controlledRegex, controlledRegex.indexOf('addMul') + 3), false);
  assert.equal(isCode('`value: ${addMul', 16), true);
  assert.equal(isCode('`value: addMul', 14), false);

  assert.equal(codeEditor.shouldTriggerJavaScriptCodeCompletion('addM', 4, 'M'), true);
  assert.equal(codeEditor.shouldTriggerJavaScriptCodeCompletion('"addM', 5, 'M'), false);
  assert.equal(codeEditor.shouldTriggerJavaScriptCodeCompletion('`value: ${addM', 15, 'M'), true);
  assert.equal(codeEditor.shouldTriggerJavaScriptCodeCompletion('addMultiple', 11, 'Multiple'), false);
});

test('Composition Monaco suggestions prefer code context and release boundary wheel events', async () => {
  const source = await readFile(codeEditorUrl, 'utf8');

  assert.match(source, /quickSuggestions:\s*{\s*comments:\s*false,\s*strings:\s*false,\s*other:\s*true\s*}/);
  assert.match(source, /scrollbar:\s*{[\s\S]*?alwaysConsumeMouseWheel:\s*false[\s\S]*?}/);
  assert.doesNotMatch(source, /scrollbar:\s*this\.compact\s*\?/);
  assert.match(source, /editor\.action\.triggerSuggest/);
});

test('Composition shape stack uses grouped node actions and a full-width inspector flow', async () => {
  const [source, styles] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(compositionStyleUrl, 'utf8')
  ]);

  assert.match(source, /class="child-row-main"/);
  assert.match(source, /class="child-row-actions"/);
  assert.match(source, /aria-label="上移"/);
  assert.match(source, /aria-label="下移"/);
  assert.match(source, /aria-label="删除"/);
  assert.match(styles, /\.composition-editor-grid\s*>\s*\.inspector-panel\s*{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(styles, /\.child-row-actions\s*{[^}]*display:\s*flex/s);
});

test('Composition narrow layout keeps the page and editor column scrollable', async () => {
  const styles = await readFile(compositionStyleUrl, 'utf8');

  assert.match(styles, /@media \(max-width:\s*1100px\)[\s\S]*?\.page-editor\s*{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /@media \(max-width:\s*1100px\)[\s\S]*?\.panel\.right\s*{[^}]*min-height:\s*680px/s);
  assert.match(styles, /@media \(max-width:\s*1100px\)[\s\S]*?\.preview-editor-root\s*{[^}]*overscroll-behavior:\s*auto/s);
  assert.match(styles, /@container \(max-width:\s*920px\)[\s\S]*?\.preview-editor-root\s*{[^}]*overflow-y:\s*auto/s);
});

test('Composition global and card settings use mutually exclusive editor tabs', async () => {
  const [page, source, styles] = await Promise.all([
    readFile(compositionPageUrl, 'utf8'),
    readFile(compositionMainUrl, 'utf8'),
    readFile(compositionStyleUrl, 'utf8')
  ]);

  assert.match(page, /class="preview-editor-tabs" role="tablist"/);
  assert.match(page, /id="btnProjectEditorTab"[\s\S]*?>[\s\S]*?全局设置/);
  assert.match(page, /id="btnCardEditorTab"[\s\S]*?>[\s\S]*?卡片设置/);
  assert.match(page, /id="projectSection" class="project-section preview-editor-view hidden"/);
  assert.match(page, /id="cardsRoot" class="cards composition-card-editor-root preview-editor-root preview-editor-view"/);
  assert.doesNotMatch(page, /preview-project-drawer|projectEditorDrawer/);
  assert.match(source, /setEditorWorkspaceView\(view\)/);
  assert.match(source, /projectSection\?\.classList\.toggle\("hidden", !showProject\)/);
  assert.match(source, /cardsRoot\?\.classList\.toggle\("hidden", showProject\)/);
  assert.match(styles, /\.preview-editor-tabs\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
});

test('Composition toolbar omits duplicate actions and keeps code actions on the code page', async () => {
  const [page, source] = await Promise.all([
    readFile(compositionPageUrl, 'utf8'),
    readFile(compositionMainUrl, 'utf8')
  ]);
  const codePage = page.match(/<section id="pageCode"[\s\S]*?<\/section>/)?.[0] || '';

  for (const id of ['btnNewProject', 'btnAddCard', 'btnUndo', 'btnRedo', 'btnGenerateCode', 'btnCopyCode']) {
    assert.doesNotMatch(page, new RegExp(`\\b${id}\\b`));
    assert.doesNotMatch(source, new RegExp(`\\b${id}\\b`));
  }
  assert.match(codePage, /id="btnGenerateCode2"[^>]*>重新生成<\/button>/);
  assert.match(codePage, /id="btnCopyCode2"[^>]*>复制<\/button>/);
  assert.match(codePage, /id="btnDownloadCode"[^>]*>导出 Kotlin 代码<\/button>/);
});

test('Composition card and child-node preset windows expose global preset management controls', async () => {
  const [page, source, presetSource, styles] = await Promise.all([
    readFile(compositionPageUrl, 'utf8'),
    readFile(compositionMainUrl, 'utf8'),
    readFile(compositionPresetUrl, 'utf8'),
    readFile(compositionStyleUrl, 'utf8')
  ]);

  assert.match(source, /data-act="open-card-preset"/);
  assert.equal((source.match(/data-act="open-node-preset"/g) || []).length, 2);
  assert.equal((source.match(/class="btn small primary child-action child-enter"/g) || []).length, 2);
  assert.equal((source.match(/class="btn small child-action child-preset"/g) || []).length, 2);
  assert.equal((source.match(/child-enter"[^>]*>进入<\/button>\s*<button class="btn small child-action child-preset"/g) || []).length, 2);
  assert.doesNotMatch(source, /child-enter[^>]*>→<\/button>/);
  assert.match(source, /showCardPresetModal\(cardId\)/);
  assert.match(source, /showNodePresetModal\(cardId, rawTreePath\)/);

  assert.match(page, /id="cardPresetModal" class="modal modal-preset hidden"/);
  assert.match(page, /id="nodePresetModal" class="modal modal-preset hidden"/);
  assert.equal((page.match(/data-preset-folder-list/g) || []).length, 2);
  assert.doesNotMatch(page, /data-preset-folder-action="(?:create|delete)"/);
  assert.equal((page.match(/data-preset-search/g) || []).length, 2);
  assert.equal((page.match(/data-preset-save-name/g) || []).length, 2);
  assert.equal((page.match(/data-preset-save-dialog(?:\s|>)/g) || []).length, 2);
  assert.equal((page.match(/data-preset-save-dialog-mask/g) || []).length, 2);
  assert.doesNotMatch(page, /preset-save-editor/);
  assert.equal((page.match(/data-preset-list/g) || []).length, 2);
  assert.equal((page.match(/data-preset-context-menu/g) || []).length, 2);
  for (const section of ['position', 'particle', 'properties']) {
    assert.equal((page.match(new RegExp(`data-preset-section="${section}"`, 'g')) || []).length, 2);
  }
  assert.equal((page.match(/data-preset-action="apply"/g) || []).length, 2);
  assert.doesNotMatch(page, /data-preset-action="(?:save|load)"/);
  assert.match(page, /id="cardPresetList" class="preset-list"/);
  assert.match(page, /id="nodePresetList" class="preset-list"/);
  assert.match(source, /installCompositionPresetMethods/);
  assert.match(source, /bindCompositionPresetEvents/);
  assert.match(presetSource, /listDirectories\(\)/);
  assert.match(presetSource, /moveCompositionPreset/);
  assert.match(presetSource, /data-preset-rename/);
  assert.match(presetSource, /data-preset-description/);
  assert.match(presetSource, /<span class="preset-list-name"[^>]*data-preset-rename/);
  assert.match(presetSource, /<span class="preset-list-description"[^>]*data-preset-description/);
  assert.doesNotMatch(presetSource, /<button class="preset-list-(?:name|description)"/);
  assert.match(presetSource, /editor\?\.type === "name" \? editorMarkup/);
  assert.match(presetSource, /editor\?\.type === "description" \? editorMarkup/);
  assert.match(presetSource, /addEventListener\("contextmenu"/);
  assert.match(presetSource, /保存当前卡片（\$\{targetName\}）为预设/);
  assert.match(presetSource, /保存当前节点（\$\{targetName\}）为预设/);
  assert.doesNotMatch(presetSource, /class="btn preset-list-delete"/);
  assert.ok(source.indexOf('installCompositionPresetMethods(CompositionBuilderApp') < source.indexOf('const app = new CompositionBuilderApp()'));

  assert.match(styles, /\.composition-editor-head\s*{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.child-row \.child-action\s*{[^}]*width:\s*42px !important;[^}]*height:\s*28px !important;[^}]*min-width:\s*42px !important;[^}]*max-width:\s*42px !important;[^}]*min-height:\s*28px !important;[^}]*max-height:\s*28px !important/s);
  assert.match(styles, /\.preset-browser-layout\s*{[^}]*grid-template-columns:\s*210px minmax\(0, 1fr\)/s);
  assert.match(styles, /\.preset-context-menu\s*{[^}]*position:\s*absolute/s);
  assert.match(styles, /\.preset-save-dialog-mask\s*{[^}]*position:\s*absolute;[^}]*inset:\s*0/s);
  assert.match(styles, /\.preset-save-dialog\s*{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\)/s);
  assert.match(styles, /\.preset-list-name,\s*\.preset-list-description\s*{[^}]*width:\s*max-content;[^}]*cursor:\s*pointer;/s);
  assert.match(styles, /@media \(max-width:\s*700px\)[\s\S]*?\.preset-browser-layout\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*overflow:\s*auto;/);
  assert.match(styles, /@media \(max-width:\s*700px\)[\s\S]*?\.modal-preset \.modal-foot\s*{[^}]*flex-wrap:\s*wrap;/);
});

test('Legacy project iframe sends context without forwarding the load event as a window', async () => {
  const source = await readFile(new URL('../src/components/LegacyPageFrame.vue', import.meta.url), 'utf8');
  assert.match(source, /@load="handleFrameLoad"/);
  assert.match(source, /function handleFrameLoad\(\)\s*{\s*sendProjectContextToFrame\(\);/);
});

test('Composition history hotkeys bypass selects but preserve native text undo', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  class FakeElement {
    constructor(kind, inputType = '') {
      this.kind = kind;
      this.inputType = inputType;
    }
    closest(selector) {
      if (this.kind === 'hidden' && selector.includes('.hidden')) return this;
      if (this.kind === 'textarea' && selector.includes('textarea')) return this;
      if (this.kind === 'contenteditable' && selector.includes('[contenteditable')) return this;
      if (this.kind === 'monaco' && selector.includes('.monaco-editor')) return this;
      if (this.kind === 'input' && selector === 'input') return { type: this.inputType };
      return null;
    }
  }

  const target = (kind, inputType = '') => new FakeElement(kind, inputType);
  const textOptions = { ElementCtor: FakeElement, hasFocusedMonaco: () => false };
  const selectTextEditing = isCompositionTextEditingTarget(target('select'), null, textOptions);
  const checkboxTextEditing = isCompositionTextEditingTarget(target('input', 'checkbox'), null, textOptions);
  assert.equal(selectTextEditing, false);
  assert.equal(checkboxTextEditing, false);
  assert.equal(isCompositionTextEditingTarget(target('input', 'text'), null, textOptions), true);
  assert.equal(isCompositionTextEditingTarget(target('textarea'), null, textOptions), true);
  assert.equal(isCompositionTextEditingTarget(target('monaco'), null, textOptions), true);
  assert.equal(isCompositionTextEditingTarget(target('hidden', 'text'), null, textOptions), false);
  assert.equal(isCompositionTextEditingTarget(target('select'), target('input', 'text'), textOptions), true);
  assert.equal(isCompositionTextEditingTarget(null, null, { ...textOptions, hasFocusedMonaco: () => true }), true);

  let prevented = 0;
  let undoCount = 0;
  const event = { preventDefault() { prevented += 1; } };
  assert.equal(handleCompositionHistoryShortcut(event, {
    undoMatched: true,
    textEditing: selectTextEditing,
    undo() { undoCount += 1; }
  }), true);
  assert.deepEqual({ prevented, undoCount }, { prevented: 1, undoCount: 1 });
  let redoCount = 0;
  assert.equal(handleCompositionHistoryShortcut(event, {
    redoMatched: true,
    textEditing: checkboxTextEditing,
    redo() { redoCount += 1; }
  }), true);
  assert.deepEqual({ prevented, redoCount }, { prevented: 2, redoCount: 1 });
  assert.equal(handleCompositionHistoryShortcut(event, {
    undoMatched: true,
    textEditing: true,
    undo() { undoCount += 1; }
  }), false);
  assert.equal(handleCompositionHistoryShortcut(event, {
    undoMatched: true,
    modalOpen: true,
    undo() { undoCount += 1; }
  }), false);
  assert.deepEqual({ prevented, undoCount, redoCount }, { prevented: 2, undoCount: 1, redoCount: 1 });

  assert.match(source, /handleCompositionHistoryShortcut\(e, \{/);
  assert.match(source, /textEditing: this\.isTextEditingTarget\(e\.target\)/);
});
