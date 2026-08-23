import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createLocalProjectRepository } from '../src/services/repositories/local-project-repository.js';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('desktop project creation requires a user-selected file location', async () => {
  const [workbench, preload, electronMain] = await Promise.all([
    readSource('../src/pages/WorkbenchPage.vue'),
    readSource('../../electron/src/preload.js'),
    readSource('../../electron/src/main.js'),
  ]);

  assert.match(workbench, /<span>项目位置<\/span>/);
  assert.match(workbench, /shell\.chooseProjectFile/);
  assert.match(workbench, /if \(!projectFilePath\.value && !await chooseProjectLocation\(\)\) return;/);
  assert.match(workbench, /filePath: projectFilePath\.value,[\s\S]*?text: JSON\.stringify\(payload, null, 2\)/);
  assert.match(preload, /chooseProjectFile: \(options\) => ipcRenderer\.invoke\('shell:chooseProjectFile'/);
  assert.match(electronMain, /dialog\.showSaveDialog\(getSenderWindow\(event\)/);
  assert.match(electronMain, /ipcMain\.handle\('shell:chooseProjectFile'/);
  assert.match(preload, /autoSaveProjectFile: \(payload\) => ipcRenderer\.invoke\('shell:autoSaveProjectFile'/);
  assert.match(electronMain, /ipcMain\.handle\('shell:autoSaveProjectFile'/);
  assert.match(electronMain, /writeProjectAutoSave/);
});

test('generator and legacy editors autosave file-backed project changes', async () => {
  const [generator, legacyFrame] = await Promise.all([
    readSource('../src/pages/GeneratorPage.vue'),
    readSource('../src/components/LegacyPageFrame.vue'),
  ]);

  assert.match(generator, /watch\(project,[\s\S]*?scheduleIndexedProjectSave\(\)/);
  assert.match(generator, /!loadedProjectId\.value && !currentProjectPath\.value/);
  assert.match(generator, /shell\.autoSaveProjectFile\(\{ filePath, text \}\)/);
  assert.match(generator, /title: '自动保存 Generator 项目',[\s\S]*?filePath/);
  assert.match(generator, /shell\.readTextFile\(filePath, \{ addToRecent: false \}\)/);
  assert.match(generator, /shell\.readTextFile\(filePath, \{ addToRecent: false \}\);\s*if \(token !== projectLoadToken\) return false;/);
  assert.match(generator, /if \(pending\?\.text\) \{\s*projectLoadToken \+= 1;/);
  assert.match(generator, /onBeforeUnmount\(\(\) => \{\s*projectLoadToken \+= 1;/);
  assert.match(generator, /onBeforeRouteLeave\(async \(\) => \{\s*projectLoadToken \+= 1;/);
  assert.match(generator, /onBeforeRouteUpdate\(async \(\) => \{\s*projectLoadToken \+= 1;/);
  assert.match(generator, /if \(projectId\) \{[\s\S]*?return;\s*\}\s*projectLoadToken \+= 1;\s*loadedProjectId\.value = '';/);
  assert.match(legacyFrame, /setInterval\(observeLegacyProjectChanges, AUTO_SAVE_POLL_MS\)/);
  assert.match(legacyFrame, /scheduleProjectAutoSave\(\)/);
  assert.match(legacyFrame, /shell\.autoSaveProjectFile\(\{ filePath, text \}\)/);
  assert.match(legacyFrame, /title: '自动保存项目',[\s\S]*?filePath/);
  assert.match(legacyFrame, /shell\.readTextFile\(filePath, \{ addToRecent: false \}\)/);
  assert.match(legacyFrame, /shell\.readTextFile\(filePath, \{ addToRecent: false \}\);\s*if \(token !== projectLoadToken\) return false;/);
  assert.match(legacyFrame, /onBeforeUnmount\(\(\) => \{\s*projectLoadToken \+= 1;/);
  assert.match(legacyFrame, /onBeforeRouteLeave\(async \(\) => \{\s*projectLoadToken \+= 1;/);
  assert.match(legacyFrame, /onBeforeRouteUpdate\(async \(\) => \{\s*projectLoadToken \+= 1;/);
  assert.match(legacyFrame, /catch \(error\) \{\s*window\.alert\([\s\S]*?void syncRouteProject\(\);\s*return false;/);
});

test('composition and generator toolbars omit project import and export controls', async () => {
  const [generator, composition, compositionMain] = await Promise.all([
    readSource('../src/pages/GeneratorPage.vue'),
    readSource('../public/legacy/composition_builder.html'),
    readSource('../public/legacy/assets/composition_builder/js/main.js'),
  ]);

  assert.doesNotMatch(generator, />导出 JSON<\/button>/);
  assert.doesNotMatch(generator, />导入 JSON<\/button>/);
  assert.doesNotMatch(composition, /id="btnImportProject"/);
  assert.doesNotMatch(composition, /id="btnExportProject"/);
  assert.doesNotMatch(compositionMain, /async exportProject\(/);
  assert.doesNotMatch(compositionMain, /async importProjectFromFile\(/);
  assert.doesNotMatch(compositionMain, /hitImport|hitSave/);
});

test('browser file imports become indexed projects that can autosave', async () => {
  const workbench = await readSource('../src/pages/WorkbenchPage.vue');

  assert.match(workbench, /async function openBrowserFile[\s\S]*?parseProjectText\(text, file\.name\)/);
  assert.match(workbench, /async function openBrowserFile[\s\S]*?projectRepository\.save\(/);
  assert.match(workbench, /async function openBrowserFile[\s\S]*?projectId: saved\?\.id/);
});

test('indexed files reject a disk project type that differs from the index', async () => {
  const workbench = await readSource('../src/pages/WorkbenchPage.vue');

  assert.match(workbench, /const indexedType = normalizeProjectType\(item\.tool\)/);
  assert.match(workbench, /if \(type !== indexedType\)/);
  assert.match(workbench, /请移除旧索引后重新打开文件/);
});

test('local project index preserves the selected file path across autosaves', async () => {
  const values = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
  try {
    const repository = createLocalProjectRepository();
    const created = await repository.save({
      tool: 'generator',
      name: 'Demo',
      filePath: 'D:/particles/Demo.json',
      payload: { tool: 'generator', emitters: [] },
    });
    await repository.save({
      id: created.id,
      tool: 'generator',
      name: 'Demo 2',
      payload: { tool: 'generator', emitters: [{ id: 'emitter_1' }] },
    });

    assert.equal((await repository.get('generator', created.id)).filePath, 'D:/particles/Demo.json');
    assert.equal((await repository.list())[0].filePath, 'D:/particles/Demo.json');
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
