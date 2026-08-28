import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createGeneratorProject } from '../src/modules/generator/defaults.js';
import { generateEmitterKotlin } from '../src/modules/generator/codegen.js';
import { generatePointsBuilderKotlin } from '../src/modules/pointsbuilder/codegen.js';
import { generatePointsBuilderKotlinParts } from '../src/modules/pointsbuilder/codegen.js';
import { evalBuilder } from '../src/modules/pointsbuilder/builder-tools.js';
import { createKindDefs } from '../public/legacy/assets/points_builder/js/kinds.js';
import { installKotlinCodegenMethods } from '../public/legacy/assets/composition_builder/js/kotlin_codegen_mixin.js';
import { createCardInputs } from '../public/legacy/assets/points_builder/js/cards.js';
import {
  applyBuilderInstanceRenamesToCompositionState,
  collectCompositionBuilderInstanceRegistry,
  syncRegisteredBuilderSnapshotsFromRegistry
} from '../public/legacy/assets/points_builder/js/instance-registry.js';
import {
  applyBuilderReferenceOverrides,
  createBuilderReferenceNode
} from '../src/modules/pointsbuilder/references.js';

function instanceProject(rotationDeg = 30) {
  return {
    state: {
      builderSnapshots: {
        rune: {
          id: 'rune',
          name: '符文',
          variables: {
            inputs: {
              scalar: { radius: 2 },
              vector: {}
            }
          },
          children: [{
            id: 'circle-template',
            kind: 'add_circle',
            label: '圆环模板',
            params: { r: 'radius', count: 8 },
            children: [],
            terms: []
          }],
          revision: 1
        }
      },
      root: {
        id: 'root',
        kind: 'ROOT',
        children: [{
          id: 'rune-instance',
          kind: 'builder_reference',
          label: '符文实例',
          params: {
            snapshotId: 'rune',
            parameterId: 'pb_instance_rune_instance',
            ox: 1,
            oy: 2,
            oz: 3,
            rotationDeg,
            rotationAxisX: 0,
            rotationAxisY: 1,
            rotationAxisZ: 0,
            overrides: {
              scalar: { radius: 4 },
              vector: {},
              modes: { scalar: {}, vector: {} },
              refs: { scalar: {}, vector: {} }
            }
          },
          children: [],
          terms: []
        }]
      }
    }
  };
}

test('实例变量只改写节点参数，不会破坏节点标识和标题', () => {
  const snapshot = {
    variables: { inputs: { scalar: { radius: 2 }, vector: {} } }
  };
  const source = [{
    id: 'radius',
    kind: 'radius',
    label: 'radius',
    params: { x: 'radius' },
    children: [],
    terms: []
  }];

  const [result] = applyBuilderReferenceOverrides(source, snapshot, {
    overrides: { scalar: { radius: 6 } }
  });

  assert.equal(result.id, 'radius');
  assert.equal(result.kind, 'radius');
  assert.equal(result.label, 'radius');
  assert.equal(result.params.x, '6');
});

test('实例预设参数编辑期间不提交半成品数值', () => {
  const originalDocument = globalThis.document;
  const originalInputElement = globalThis.HTMLInputElement;

  class FakeInput extends EventTarget {
    constructor() {
      super();
      this.value = '';
      this.className = '';
      this.dataset = {};
      this.placeholder = '';
      this.autocomplete = '';
      this.spellcheck = false;
      this.inputMode = '';
      this.type = '';
    }

    blur() {
      this.dispatchEvent(new Event('blur'));
    }
  }

  globalThis.HTMLInputElement = FakeInput;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'input');
      return new FakeInput();
    }
  };

  try {
    const committed = [];
    const { inputNum } = createCardInputs({
      enableExprNumbers: () => false,
      getParamStep: () => 0.1
    });
    const input = inputNum(0.4, (value) => committed.push(value), { commitOnChange: true });

    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.value = '0';
    input.dispatchEvent(new Event('input'));
    input.value = '0.';
    input.dispatchEvent(new Event('input'));
    input.value = '0.7';
    input.dispatchEvent(new Event('input'));

    assert.deepEqual(committed, []);
    input.dispatchEvent(new Event('change'));
    assert.deepEqual(committed, ['0.7']);

    const arrowUp = new Event('keydown', { cancelable: true });
    Object.defineProperty(arrowUp, 'key', { value: 'ArrowUp' });
    input.dispatchEvent(arrowUp);
    assert.deepEqual(committed, ['0.7', '0.8']);
  } finally {
    globalThis.document = originalDocument;
    globalThis.HTMLInputElement = originalInputElement;
  }
});

test('实例节点默认获得独立参数 ID 和自身 Offset', () => {
  const node = createBuilderReferenceNode(
    { id: 'rune', name: '符文' },
    { id: 'instance-1', ox: 1, oy: -2, oz: 3 }
  );

  assert.equal(node.params.parameterId, 'pb_instance_instance_1');
  assert.deepEqual(
    [node.params.ox, node.params.oy, node.params.oz],
    [1, -2, 3]
  );
});

test('实例 Kotlin 只构建一次模板，并通过 addBuilder 应用 Offset 和旋转', () => {
  const parts = generatePointsBuilderKotlinParts(instanceProject());

  assert.deepEqual(parts.constants, []);
  assert.equal(parts.declarations.length, 1);
  assert.match(parts.declarations[0], /^private val builderInstanceRune: PointsBuilder = PointsBuilder\(\)/);
  assert.match(parts.declarations[0], /\.addCircle\(4\.0, 8\)/);
  assert.doesNotMatch(parts.declarations[0], /by lazy|createWithoutClone/);
  assert.match(
    parts.expression,
    /\.addPoints\(builderInstanceRune\.createWithTransform\(30\.0 \* PI \/ 180\.0, RelativeLocation\(1\.0, 2\.0, 3\.0\)\)\)/
  );
});

test('纯 PointsBuilder 输出让实例声明与主 Builder 并列，不使用 run 包裹', () => {
  const kotlin = generatePointsBuilderKotlin(instanceProject(0));

  assert.match(kotlin, /^private val builderInstanceRune: PointsBuilder = PointsBuilder\(\)/);
  assert.match(kotlin, /\n\nPointsBuilder\(\)/);
  assert.match(kotlin, /\.addBuilder\(RelativeLocation\(1\.0, 2\.0, 3\.0\), builderInstanceRune\)/);
  assert.doesNotMatch(kotlin, /^run \{|PointsBuilder\.of\(builderInstanceRune\)|by lazy/);
});

test('Generator 只将实例模板提升到类级，不输出编辑器专用 ID 常量', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  card.emitter.type = 'points_builder';
  card.emitter.builderState = instanceProject(0);

  const kotlin = generateEmitterKotlin(project);

  assert.equal((kotlin.match(/private companion object \{/g) || []).length, 1);
  assert.doesNotMatch(kotlin, /BUILDER_SNAPSHOT_[A-Z0-9_]+_PARAM_ID\s*=/);
  assert.match(kotlin, /private val builderInstanceRune: PointsBuilder = PointsBuilder\(\)/);
  assert.doesNotMatch(kotlin, /@JvmField\s+private val builderInstanceRune/);
  assert.match(
    kotlin,
    /\.addBuilder\(RelativeLocation\(1\.0, 2\.0, 3\.0\), builderInstanceRune\)/
  );
});

test('同一实例 ID 可同时生成静态属性和构造函数', () => {
  const project = instanceProject(0);
  const construct = JSON.parse(JSON.stringify(project.state.root.children[0]));
  construct.id = 'rune-construct';
  construct.params.instanceMode = 'construct';
  project.state.root.children.push(construct);
  const kotlin = generateEmitterKotlin(Object.assign(createGeneratorProject(), {
    emitters: [{
      ...createGeneratorProject().emitters[0],
      emitter: { type: 'points_builder', builderState: project }
    }]
  }));
  assert.match(kotlin, /private val builderInstanceRune: PointsBuilder = PointsBuilder\(\)/);
  assert.doesNotMatch(kotlin, /@JvmField\s+private val builderInstanceRune/);
  assert.match(kotlin, /@JvmStatic\s+private fun builderInstanceRune\(radius: Double\): PointsBuilder/);
});

test('实例卡片提供 Offset、列表式预设参数和稳定提交的完整接线', async () => {
  const [cardsSource, mainSource, styleSource] = await Promise.all([
    readFile(new URL('../public/legacy/assets/points_builder/js/cards.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/css/style.css', import.meta.url), 'utf8')
  ]);

  assert.match(cardsSource, /case "builder_reference":[\s\S]*?instanceIdInput\.readOnly = true/);
  assert.match(cardsSource, /case "builder_reference":[\s\S]*?builder-reference-reconstruct-btn/);
  assert.match(cardsSource, /case "builder_reference":[\s\S]*?row\("Offset", makeVec3Editor\(p, "o"/);
  assert.match(mainSource, /renderBuilderReferenceVariables,[\s\S]*?changeBuilderReferenceId,[\s\S]*?setBuilderReferenceInstanceMode/);
  assert.match(mainSource, /data-builder-reference-dialog-input[\s\S]*?data-builder-reference-id-suggestions/);
  assert.doesNotMatch(mainSource, /<datalist id="builder-reference-id-suggestions">/);
  assert.match(mainSource, /role="combobox" aria-autocomplete="list" aria-expanded="false"/);
  assert.match(mainSource, /role="listbox" aria-label="项目内已注册实例"/);
  assert.match(mainSource, /builder-reference-id-suggestions-head[\s\S]*?已注册实例/);
  assert.match(mainSource, /builder-reference-id-suggestions-count/);
  assert.match(mainSource, /builder-reference-id-suggestion-badge[\s\S]*?builder-reference-id-suggestion-state/);
  assert.match(mainSource, /refreshBuilderSnapshotVariables\(snapshot, normalized\)/);
  assert.match(mainSource, /title: "预设参数"/);
  assert.match(mainSource, /modeLabel\.textContent = "输入类型"/);
  assert.match(mainSource, /valueLabel\.textContent = "输入参数"/);
  assert.match(mainSource, /manualOption\.textContent = "手动输入"/);
  assert.match(mainSource, /referenceOption\.textContent = "引用变量"/);
  assert.match(mainSource, /commitOnChange: true/);
  assert.match(cardsSource, /const commitOnChange = !!options\.commitOnChange/);
  assert.match(cardsSource, /if \(!commitOnChange\) onInput\(String\(i\.value \?\? ""\)\)/);
  assert.match(cardsSource, /i\.addEventListener\("change", commitValue\)/);
  assert.match(styleSource, /\.builder-reference-variable-panel \.preset-variable-list \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/);
  assert.match(styleSource, /\.builder-reference-variable-panel \.preset-variable-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(styleSource, /\.builder-reference-variable-panel \.preset-variable-controls \{[\s\S]*?grid-template-columns: minmax\(132px, \.72fr\) minmax\(0, 1\.28fr\);/);
  assert.match(styleSource, /\.builder-reference-variable-panel \.preset-variable-name \{[\s\S]*?white-space: normal;/);
  assert.match(styleSource, /\.builder-reference-variable-panel \.preset-variable-name::after \{[\s\S]*?content: ":"/);
  assert.match(styleSource, /\.builder-reference-id-suggestions \{[\s\S]*?color-mix\(in srgb, var\(--panel\) 96%/);
  assert.match(styleSource, /\.builder-reference-id-suggestion \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(styleSource, /\.builder-reference-id-suggestions-head \{[\s\S]*?letter-spacing: (?!0(?:;|\s))/);
});

test('N 添加菜单保持双列卡片并隐藏组效果，右键菜单提供创建入口', async () => {
  const [mainSource, pickerSource, cardsSource, pageSource, styleSource] = await Promise.all([
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main-picker.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/cards.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/pointsbuilder.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/css/style.css', import.meta.url), 'utf8')
  ]);

  const createGroupSource = mainSource.match(/function createInstantiatedGroup\(ids\) \{[\s\S]*?\n    \}/)?.[0] || '';
  const blankMenuSource = mainSource.match(/function openActionMenuForBlankNoSelection\(ev\) \{[\s\S]*?return showActionMenu\(ev\.clientX, ev\.clientY, items\);\n\}/)?.[0] || '';
  assert.match(createGroupSource, /makeBuilderSnapshotFromNode\(sourceNode\)/);
  assert.match(createGroupSource, /makeNode\(BUILDER_REFERENCE_KIND/);
  assert.doesNotMatch(createGroupSource, /makeNode\(EFFECT_RING_KIND/);
  assert.doesNotMatch(blankMenuSource, /label: "实例化组"/);
  assert.match(blankMenuSource, /label: "添加组"[\s\S]*?label: "普通组"[\s\S]*?addShortcutKindInContext\("add_builder"[\s\S]*?label: "遮罩组"[\s\S]*?addShortcutKindInContext\("clear_as_mask"/);
  assert.doesNotMatch(blankMenuSource, /label: "添加遮罩组"/);
  assert.match(blankMenuSource, /label: "组效果"[\s\S]*?label: "旋转嵌套组"[\s\S]*?addShortcutKindInContext\("add_with"/);
  assert.match(blankMenuSource, /label: "组效果"[\s\S]*?label: "环形放置"[\s\S]*?addShortcutKindInContext\("effect_ring"/);
  assert.match(pickerSource, /entry\.kind !== "effect_ring" && entry\.kind !== "add_with"/);
  assert.doesNotMatch(pickerSource, /btnModalGroupEffectsTab|renderGroupEffectsPicker|pickerMode === "effects"/);
  assert.match(styleSource, /\.picker\.card-picker \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styleSource, /\.picker\.card-picker \.picker-category-items \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cardsSource, /node\.kind === "effect_ring" \? "组效果"/);
  assert.match(mainSource, /const isEffectRing = singleCtxNode\?\.node\?\.kind === EFFECT_RING_KIND;[\s\S]*?label: "转换为普通组"[\s\S]*?convertSingleGroupNode\(singleCtxNode\.node, "add_builder", \{ expanded: true \}\)/);
  assert.match(mainSource, /sourceNode\.kind === "add_with" && options\.expanded \? "旋转嵌套后的普通组" : "普通组"/);
  assert.doesNotMatch(pageSource, /btnModalGroupEffectsTab/);
  assert.match(pageSource, /class="preset-ring-title">环形放置<\/div>/);
});

test('实例 V/R 快捷操作直接绑定原生 Offset 和 Rotation 参数', async () => {
  const mainSource = await readFile(
    new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(mainSource, /NATIVE_OFFSET_TARGET_KINDS = new Set\(\[[\s\S]*?BUILDER_REFERENCE_KIND/);
  assert.match(mainSource, /row\.ctx\.node\.kind === BUILDER_REFERENCE_KIND[\s\S]*?valueKey: "rotationDeg"/);
  assert.match(mainSource, /usableRows\.every\(\(row\) => row\.ctx\.node\.kind === BUILDER_REFERENCE_KIND\)[\s\S]*?startRotateMode\(\[\], \{[\s\S]*?bindings,/);
});

test('环形实例使用标准参数编辑宿主、自动同步参数，并在删除后释放零引用快照', async () => {
  const [mainSource, cardsSource, pickerSource, styleSource, pointsBuilderHtml, compositionHtml] = await Promise.all([
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/cards.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main-picker.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/css/style.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/pointsbuilder.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/composition_pointsbuilder.html', import.meta.url), 'utf8')
  ]);

  assert.match(mainSource, /function renderEffectRingParams\(body, node\)[\s\S]*?body\.appendChild\(presetRingTool\)/);
  assert.match(cardsSource, /case "effect_ring":[\s\S]*?ctx\.renderEffectRingParams\?\.\(body, node\)/);
  assert.match(cardsSource, /const remainingSelectionIds = Array\.from\(selectedNodeIds\)\.filter\(\(id\) => id !== node\.id\);[\s\S]*?setSelectedNodeIds\(remainingSelectionIds,/);
  assert.match(pickerSource, /creationHandled = onNodeCreated\(nn,[\s\S]*?\) === true;[\s\S]*?if \(!creationHandled\) \{/);
  assert.match(mainSource, /activeParameterizedInstanceNodeId !== target\.id\) resetPresetRingSharedVariableState\(\)/);
  assert.match(mainSource, /function schedulePresetRingSnapshotSync\(/);
  assert.doesNotMatch(mainSource, /function renderPresetRingPreview\(/);
  assert.match(mainSource, /if \(presetsActive\) schedulePresetLibraryRender\(\);/);
  assert.match(mainSource, /function schedulePresetLibraryRender\(options = \{\}\)[\s\S]*?rightPanelPage === "presets" && presetLibraryDirty[\s\S]*?presetLibraryDirty = false/);
  assert.match(mainSource, /if \(isBuilderSnapshotEditNode\(item\)\) add\(item\.instanceEdit\?\.snapshotId\)/);
  assert.match(mainSource, /function renderAll\(\) \{\s*cleanupUnreferencedBuilderSnapshots\(\)/);
  assert.doesNotMatch(mainSource, /function getPresetRingVariableGroups\(\) \{\s*const sharedGroups = getPresetRingVariableGroups\(\)/);
  const updateSource = mainSource.match(/if \(activeNode\) \{[\s\S]*?return true;/)?.[0] || '';
  assert.ok(updateSource.indexOf('historyCapture("update_effect_ring")') >= 0);
  assert.ok(updateSource.indexOf('historyCapture("update_effect_ring")') < updateSource.indexOf('snapshots[existing.id] = updated'));
  assert.match(updateSource, /snapshotsByDefinitionKey/);
  assert.match(styleSource, /\.preset-ring-slots \{[\s\S]*?flex: 1 1 0;/);
  assert.match(styleSource, /\.preset-ring-shared-vars \{[\s\S]*?flex: 1 1 0;/);
  assert.doesNotMatch(pointsBuilderHtml, /id="parameterizedInstanceEditorHost"/);
  assert.doesNotMatch(compositionHtml, /id="parameterizedInstanceEditorHost"/);
  for (const html of [pointsBuilderHtml, compositionHtml]) {
    const presetsStart = html.indexOf('id="rightPresetsPage"');
    const presetsEnd = html.indexOf('</section>', presetsStart);
    const ringTool = html.indexOf('id="presetRingTool"');
    assert.ok(presetsStart >= 0 && presetsEnd > presetsStart && ringTool > presetsEnd);
  }
  assert.doesNotMatch(pointsBuilderHtml, /id="btnOpenPresetRingTool(?:Menu)?"/);
  assert.doesNotMatch(compositionHtml, /id="btnOpenPresetRingTool(?:Menu)?"/);
  assert.doesNotMatch(pointsBuilderHtml, /id="btnPresetRingApply"|id="selPresetRingPreviewMode"/);
  assert.doesNotMatch(compositionHtml, /id="btnPresetRingApply"|id="selPresetRingPreviewMode"/);
});

test('实例 ID 注册表跨 Composition PointsBuilder 汇总并同步重命名引用', () => {
  const makeState = (snapshotId, referenceId, ringId = '') => ({
    state: {
      builderSnapshots: {
        [snapshotId]: {
          id: snapshotId,
          name: snapshotId,
          children: [],
          revision: 1
        }
      },
      builderPresetMappings: { presetA: snapshotId },
      root: {
        id: 'root',
        kind: 'ROOT',
        children: [
          {
            id: referenceId,
            kind: 'builder_reference',
            params: { snapshotId },
            children: []
          },
          ...(ringId ? [{
            id: ringId,
            kind: 'effect_ring',
            params: { snapshotIds: [snapshotId] },
            children: []
          }] : [])
        ]
      }
    }
  });
  const composition = {
    cards: [
      { id: 'cardA', name: '卡片 A', builderState: makeState('sharedRune', 'refA', 'ringA') },
      { id: 'cardB', name: '卡片 B', builderState: makeState('otherRune', 'refB') }
    ]
  };

  const registry = collectCompositionBuilderInstanceRegistry(composition);
  assert.deepEqual(registry.map((item) => item.id), ['otherRune', 'sharedRune']);
  assert.equal(registry.find((item) => item.id === 'sharedRune')?.referenceCount, 2);
  assert.equal(registry.find((item) => item.id === 'sharedRune')?.owners[0]?.ownerName, '卡片 A');
  assert.equal(registry.find((item) => item.id === 'sharedRune')?.snapshot?.id, 'sharedRune');

  const result = applyBuilderInstanceRenamesToCompositionState(composition, [
    { from: 'sharedRune', to: 'sharedRuneLarge' }
  ]);
  assert.equal(result.changed, true);
  const builder = composition.cards[0].builderState.state;
  assert.ok(builder.builderSnapshots.sharedRuneLarge);
  assert.equal(builder.builderSnapshots.sharedRune, undefined);
  assert.equal(builder.root.children[0].params.snapshotId, 'sharedRuneLarge');
  assert.deepEqual(builder.root.children[1].params.snapshotIds, ['sharedRuneLarge']);
  assert.equal(builder.builderPresetMappings.presetA, 'sharedRuneLarge');
});

test('Composition 卡片引用另一张卡片的注册实例时会同步完整点集', () => {
  const sourceSnapshot = {
    id: 'preset1',
    name: 'preset1',
    children: [{
      id: 'circle',
      kind: 'add_circle',
      params: { r: 2, count: 4 },
      children: [],
      terms: []
    }],
    revision: 1
  };
  const composition = {
    cards: [{
      id: 'card1',
      name: '卡片 1',
      builderState: {
        state: {
          builderSnapshots: { preset1: sourceSnapshot },
          root: { id: 'root', kind: 'ROOT', children: [] }
        }
      }
    }]
  };
  const targetState = {
    builderSnapshots: {
      preset1: {
        id: 'preset1',
        children: [{
          id: 'stale-point',
          kind: 'add_point',
          params: { x: 0, y: 0, z: 0 },
          children: [],
          terms: []
        }]
      }
    },
    root: {
      id: 'root',
      kind: 'ROOT',
      children: [{
        id: 'card2-reference',
        kind: 'builder_reference',
        params: {
          snapshotId: 'preset1',
          instanceBindingMode: 'registered',
          ox: 0,
          oy: 0,
          oz: 0,
          scale: 1,
          rotationDeg: 0,
          rotationAxisX: 0,
          rotationAxisY: 1,
          rotationAxisZ: 0
        },
        children: [],
        terms: []
      }]
    }
  };

  const registry = collectCompositionBuilderInstanceRegistry(composition);
  const importedSnapshot = registry.find((entry) => entry.id === 'preset1')?.snapshot;

  assert.deepEqual(importedSnapshot?.children, sourceSnapshot.children);
  const firstSync = syncRegisteredBuilderSnapshotsFromRegistry(targetState, registry);
  assert.equal(firstSync.changed, true);
  const points = evalBuilder(targetState.root.children, undefined, { snapshots: targetState.builderSnapshots });
  assert.equal(points.length, 4);

  sourceSnapshot.children[0].params.count = 6;
  const updatedRegistry = collectCompositionBuilderInstanceRegistry(composition);
  const secondSync = syncRegisteredBuilderSnapshotsFromRegistry(targetState, updatedRegistry);
  assert.equal(secondSync.changed, true);
  const updatedPoints = evalBuilder(targetState.root.children, undefined, { snapshots: targetState.builderSnapshots });
  assert.equal(updatedPoints.length, 6);

  targetState.root.children[0].params.instanceBindingMode = 'indexed';
  targetState.builderSnapshots.preset1.children = [{
    id: 'indexed-point',
    kind: 'add_point',
    params: { x: 0, y: 0, z: 0 },
    children: [],
    terms: []
  }];
  sourceSnapshot.children[0].params.count = 8;
  const indexedSync = syncRegisteredBuilderSnapshotsFromRegistry(
    targetState,
    collectCompositionBuilderInstanceRegistry(composition)
  );
  assert.equal(indexedSync.changed, false);
  const indexedPoints = evalBuilder(targetState.root.children, undefined, { snapshots: targetState.builderSnapshots });
  assert.equal(indexedPoints.length, 1);
});

test('索引式实例内部的注册式依赖仍会同步项目快照', () => {
  const sourceSnapshot = {
    id: 'preset1',
    children: [{
      id: 'circle',
      kind: 'add_circle',
      params: { r: 2, count: 4 },
      children: [],
      terms: []
    }]
  };
  const targetState = {
    builderSnapshots: {
      outer: {
        id: 'outer',
        children: [{
          id: 'nested-reference',
          kind: 'builder_reference',
          params: {
            snapshotId: 'preset1',
            instanceBindingMode: 'registered',
            ox: 0,
            oy: 0,
            oz: 0,
            scale: 1,
            rotationDeg: 0,
            rotationAxisX: 0,
            rotationAxisY: 1,
            rotationAxisZ: 0
          },
          children: [],
          terms: []
        }]
      },
      preset1: {
        id: 'preset1',
        children: [{ id: 'stale', kind: 'add_point', params: { x: 0, y: 0, z: 0 }, children: [], terms: [] }]
      }
    },
    root: {
      id: 'root',
      kind: 'ROOT',
      children: [{
        id: 'outer-reference',
        kind: 'builder_reference',
        params: {
          snapshotId: 'outer',
          instanceBindingMode: 'indexed',
          ox: 0,
          oy: 0,
          oz: 0,
          scale: 1,
          rotationDeg: 0,
          rotationAxisX: 0,
          rotationAxisY: 1,
          rotationAxisZ: 0
        },
        children: [],
        terms: []
      }]
    }
  };
  const outerBefore = structuredClone(targetState.builderSnapshots.outer);
  const result = syncRegisteredBuilderSnapshotsFromRegistry(targetState, [{
    id: 'preset1',
    registered: true,
    snapshot: sourceSnapshot
  }]);

  assert.equal(result.changed, true);
  assert.deepEqual(targetState.builderSnapshots.outer, outerBefore);
  const points = evalBuilder(targetState.root.children, undefined, { snapshots: targetState.builderSnapshots });
  assert.equal(points.length, 4);
});

test('右栏提供独立实例 ID 页面，Composition 上下文发布跨 Builder 注册表', async () => {
  const [mainSource, compositionMainSource, pointsBuilderHtml, compositionHtml] = await Promise.all([
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/pointsbuilder.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/composition_pointsbuilder.html', import.meta.url), 'utf8')
  ]);

  for (const html of [pointsBuilderHtml, compositionHtml]) {
    assert.match(html, /id="btnRightPresetsTab"[\s\S]*?id="btnRightInstancesTab"[\s\S]*?id="btnRightKotlinTab"/);
    assert.match(html, /id="rightInstancesPage"[\s\S]*?id="builderInstanceRegistryList"/);
  }
  assert.match(mainSource, /function renderBuilderInstanceRegistry\(\)/);
  assert.match(mainSource, /function renameRegisteredBuilderInstanceId\(fromId, rawToId, knownEntry = null\)/);
  assert.match(mainSource, /if \(rawTo === from\) return true;/);
  assert.match(mainSource, /function importRegisteredBuilderSnapshot\(snapshotId\)/);
  assert.match(mainSource, /syncRegisteredBuilderSnapshotsFromRegistry\(state, compositionBuilderInstanceRegistry/);
  assert.match(mainSource, /const restoredState = normalizeState\(storedState\);[\s\S]*?syncCompositionRegisteredBuilderSnapshots\(\);/);
  assert.match(mainSource, /state = normalizeState\(record\.state\);[\s\S]*?syncCompositionRegisteredBuilderSnapshots\(\);/);
  assert.match(compositionMainSource, /builderInstanceRegistry:\s*collectCompositionBuilderInstanceRegistry\(this\.state\)/);
  assert.match(compositionMainSource, /applyBuilderInstanceRenamesToCompositionState\(this\.state, pendingRenames/);
  assert.match(compositionMainSource, /createBuilderTools\(\{[\s\S]*?applyPointsBuilderInstanceOverrides/);
});

test('旧版实例缩放只生成一个 Double 小数后缀', () => {
  const U = {
    fmt(value) {
      const number = Number(value);
      return Number.isInteger(number) ? `${number}.0` : String(number);
    }
  };
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const int = (value, fallback = 0) => Math.trunc(num(value, fallback));
  const relExpr = (x, y, z) => `RelativeLocation(${U.fmt(num(x))}, ${U.fmt(num(y))}, ${U.fmt(num(z))})`;
  const kinds = createKindDefs({ U, num, int, relExpr });
  const emitCtx = {
    snapshots: {
      rune: { id: 'rune', children: [], variables: { inputs: { scalar: {}, vector: {} } } }
    },
    referenceDecls: [],
    referenceNames: new Set(),
    decls: []
  };

  const [line] = kinds.builder_reference.kotlin({
    kind: 'builder_reference',
    params: {
      snapshotId: 'rune',
      instanceMode: 'static',
      scale: 2,
      rotationDeg: 0,
      rotationAxisX: 0,
      rotationAxisY: 1,
      rotationAxisZ: 0,
      ox: 0,
      oy: 0,
      oz: 0
    }
  }, emitCtx, '', () => []);

  assert.match(line, /createWithTransform\(2\.0, 0\.0 \* PI \/ 180\.0,/);
  assert.doesNotMatch(line, /2\.0\.0/);
});

test('重复环形实例使用 let 局部副本避免重复引用歧义', () => {
  const project = {
    state: {
      builderSnapshots: {
        rune: {
          id: 'rune',
          children: [{ id: 'circle', kind: 'add_circle', params: { r: 1, count: 4 }, children: [], terms: [] }]
        }
      },
      root: {
        id: 'root',
        kind: 'ROOT',
        children: [{
          id: 'ring',
          kind: 'effect_ring',
          params: {
            snapshotIds: ['rune', 'rune'],
            count: 2,
            radius: 3,
            originX: 0,
            originY: 0,
            originZ: 0,
            offsetX: 0,
            offsetY: 0,
            offsetZ: 0,
            faceCenter: true,
            reverse: false
          },
          children: [],
          terms: []
        }]
      }
    }
  };
  const parts = generatePointsBuilderKotlinParts(project);
  assert.match(parts.expression, /builderInstanceRune\.let \{/);
  assert.match(parts.expression, /val duplicateId = it/);
  assert.match(parts.expression, /return@let res/);
  assert.match(parts.expression, /getRadianXZ\(3\.0, 2, 0\.0, 2 \* PI, 0\.0 \* PI \/ 180\.0\)/);
  assert.match(parts.expression, /source\.axis\(RelativeLocation\(0\.0, 0\.0, 1\.0\)\)/);
  assert.doesNotMatch(parts.constants.join('\n'), /BUILDER_SNAPSHOT_[A-Z0-9_]+_PARAM_ID\s*=/);
});

test('环形放置使用环形对称轴旋转，不沿用预设默认 Y 轴把 XZ 点集立起来', () => {
  const snapshots = {
    rune: {
      id: 'rune',
      children: [{
        id: 'point',
        kind: 'add_point',
        params: { x: 1, y: 0, z: 0 },
        children: [],
        terms: []
      }]
    }
  };
  const nodes = [{
    id: 'ring',
    kind: 'effect_ring',
    params: {
      snapshotIds: ['rune'],
      count: 4,
      radius: 3,
      startDeg: 90,
      originX: 0,
      originY: 0,
      originZ: 0,
      axisX: 0,
      axisY: 0,
      axisZ: 1,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      faceCenter: true,
      reverse: false
    },
    children: [],
    terms: []
  }];

  const points = evalBuilder(nodes, undefined, { snapshots });

  assert.equal(points.length, 4);
  assert.ok(points.every((point) => Math.abs(point.y) < 1e-9));
  assert.ok(points.some((point) => Math.abs(point.z) > 1e-9));

  nodes[0].params.offsetX = 5;
  nodes[0].params.offsetY = -2;
  nodes[0].params.offsetZ = 7;
  const shifted = evalBuilder(nodes, undefined, { snapshots });
  shifted.forEach((point, index) => {
    assert.ok(Math.abs(point.x - points[index].x - 5) < 1e-9);
    assert.ok(Math.abs(point.y - points[index].y + 2) < 1e-9);
    assert.ok(Math.abs(point.z - points[index].z - 7) < 1e-9);
  });
});

test('环形卡片展开为普通组时保留 axis → rotateTo 顺序和零轴回退', async () => {
  const source = await readFile(
    new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url),
    'utf8'
  );
  const expansion = source.match(/function buildExpandedEffectRingGroup\(node\) \{[\s\S]*?\n    \}/)?.[0] || '';

  assert.match(expansion, /const axisLength = U\.len\(rawAxis\)/);
  assert.match(expansion, /: U\.v\(0, 0, 1\)/);
  assert.match(expansion, /makeNode\("axis", \{ params: \{ x: ringAxis\.x, y: ringAxis\.y, z: ringAxis\.z \} \}\)/);
  assert.match(expansion, /makeNode\("rotate_to"/);
  assert.doesNotMatch(expansion, /makeNode\("rotate_as_axis"/);
});

test('环形普通组的旋转节点与实例运行时点集保持等价', () => {
  const snapshots = {
    rune: {
      id: 'rune',
      children: [
        { id: 'a', kind: 'add_point', params: { x: 1, y: 2, z: 3 }, children: [], terms: [] },
        { id: 'b', kind: 'add_point', params: { x: -2, y: 0.5, z: 1 }, children: [], terms: [] }
      ]
    }
  };
  const normalize = (point, fallback) => {
    const length = Math.hypot(point.x, point.y, point.z);
    return length > 1e-9
      ? { x: point.x / length, y: point.y / length, z: point.z / length }
      : fallback;
  };

  for (const rawAxis of [{ x: 0.3, y: 0.8, z: 0.4 }, { x: 0, y: 0, z: 0 }]) {
    const ringAxis = normalize(rawAxis, { x: 0, y: 0, z: 1 });
    const radius = 3;
    const angle = 37 * Math.PI / 180;
    const radial = { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius };
    const target = { x: -radial.x, y: -radial.y, z: -radial.z };
    const params = {
      snapshotIds: ['rune'], count: 1, radius, startDeg: 37,
      originX: 1, originY: -2, originZ: 0.5,
      axisX: rawAxis.x, axisY: rawAxis.y, axisZ: rawAxis.z,
      offsetX: 0.25, offsetY: 0.5, offsetZ: -0.75,
      faceCenter: true, reverse: false
    };
    const runtime = evalBuilder([
      { id: 'ring', kind: 'effect_ring', params, children: [], terms: [] }
    ], undefined, { snapshots });
    const expanded = evalBuilder([{
      id: 'outer',
      kind: 'add_builder',
      params: { ox: params.offsetX, oy: params.offsetY, oz: params.offsetZ },
      children: [{
        id: 'slot',
        kind: 'add_builder',
        params: {
          ox: params.originX + radial.x,
          oy: params.originY,
          oz: params.originZ + radial.z
        },
        children: [
          ...snapshots.rune.children,
          { id: 'axis', kind: 'axis', params: ringAxis, children: [], terms: [] },
          { id: 'to', kind: 'rotate_to', params: { mode: 'toVec', tox: target.x, toy: target.y, toz: target.z }, children: [], terms: [] }
        ],
        terms: []
      }],
      terms: []
    }]);

    assert.equal(expanded.length, runtime.length);
    expanded.forEach((point, index) => {
      assert.ok(Math.abs(point.x - runtime[index].x) < 1e-8);
      assert.ok(Math.abs(point.y - runtime[index].y) < 1e-8);
      assert.ok(Math.abs(point.z - runtime[index].z) < 1e-8);
    });
  }
});

test('legacy composition companion object 用空格缩进 PointsBuilder 声明', () => {
  class CompositionBuilderApp {}
  const indentText = (text, indent = '    ') => String(text || '')
    .split(/\r?\n/)
    .map((line) => `${indent}${line}`)
    .join('\n');
  installKotlinCodegenMethods(CompositionBuilderApp, { indentText });
  const app = new CompositionBuilderApp();
  app.builderCodegenContext = {
    constants: new Map(),
    referenceDecls: new Map([['static:rune', 'private val builderInstanceRune: PointsBuilder = PointsBuilder()\n  .addCircle(1.0, 8)']])
  };

  const kotlin = app.buildBuilderCompanionObject();

  assert.match(kotlin, /^ {8}private val builderInstanceRune/m);
  assert.match(kotlin, /^ {10}\.addCircle/m);
  assert.doesNotMatch(kotlin, /^8/m);
});

test('归一化相同的快照 ID 仍生成独立模板和私有常量', () => {
  const snapshot = (id) => ({
    id,
    privateConstants: { 'A-B': 1 },
    children: [{
      id: 'same_rel',
      kind: 'points_on_each_offset',
      params: { offX: 1, offY: 0, offZ: 0, kotlinMode: 'valRel' },
      children: [],
      terms: []
    }]
  });
  const reference = (id, nodeId) => ({
    id: nodeId,
    kind: 'builder_reference',
    params: {
      snapshotId: id,
      instanceMode: 'static',
      ox: 0,
      oy: 0,
      oz: 0,
      scale: 1,
      rotationDeg: 0,
      rotationAxisX: 0,
      rotationAxisY: 1,
      rotationAxisZ: 0
    },
    children: [],
    terms: []
  });
  const parts = generatePointsBuilderKotlinParts({
    state: {
      builderSnapshots: {
        'foo-bar': snapshot('foo-bar'),
        foo_bar: snapshot('foo_bar')
      },
      root: {
        id: 'root',
        kind: 'ROOT',
        children: [reference('foo-bar', 'ref-a'), reference('foo_bar', 'ref-b')]
      }
    }
  });

  assert.equal(parts.declarations.length, 2);
  assert.match(parts.declarations[0], /builderInstanceFooBar/);
  assert.match(parts.declarations[1], /builderInstanceFooBar2/);
  assert.equal(parts.constants.filter((line) => /A_B/.test(line)).length, 2);
  assert.match(parts.constants.join('\n'), /BUILDER_SNAPSHOT_FOO_BAR_PARAM_ID_A_B_2/);
});

test('composition 可让卡片引用另一张卡片注册的实例', async () => {
  const { generateCompositionKotlin } = await import('../src/modules/composition/codegen.js');
  const { createCompositionProject, createCompositionCard } = await import('../src/modules/composition/defaults.js');
  const project = createCompositionProject({ cards: [] });
  const source = createCompositionCard({ name: '源卡片' });
  source.builderState.state.builderSnapshots = {
    shared: { id: 'shared', children: [{ id: 'circle', kind: 'add_circle', params: { r: 2, count: 4 }, children: [], terms: [] }] }
  };
  const target = createCompositionCard({ name: '引用卡片' });
  target.builderState.state.root.children = [{
    id: 'ref',
    kind: 'builder_reference',
    params: { snapshotId: 'shared', ox: 0, oy: 0, oz: 0, scale: 1, rotationDeg: 0, rotationAxisX: 0, rotationAxisY: 1, rotationAxisZ: 0 }
  }];
  project.cards = [source, target];
  const kotlin = generateCompositionKotlin(project);
  assert.match(kotlin, /private val builderInstanceShared: PointsBuilder = PointsBuilder\(\)/);
  assert.match(kotlin, /builderInstanceShared/);
});

test('composition 静态实例会把预声明变量和 PointsBuilder 一起放入 companion object', async () => {
  const { generateCompositionKotlin } = await import('../src/modules/composition/codegen.js');
  const { createCompositionProject, createCompositionCard } = await import('../src/modules/composition/defaults.js');
  const project = createCompositionProject({ cards: [] });
  const card = createCompositionCard({ name: '静态实例卡片' });
  card.builderState.state.builderSnapshots = {
    rune: {
      id: 'rune',
      children: [{
        id: 'offsetNode',
        kind: 'points_on_each_offset',
        params: { offX: 1, offY: 0, offZ: 0, kotlinMode: 'valRel' },
        children: [],
        terms: []
      }]
    }
  };
  card.builderState.state.root.children = [{
    id: 'ref',
    kind: 'builder_reference',
    params: {
      snapshotId: 'rune',
      instanceMode: 'static',
      ox: 0, oy: 0, oz: 0,
      scale: 1, rotationDeg: 0,
      rotationAxisX: 0, rotationAxisY: 1, rotationAxisZ: 0
    }
  }];
  project.cards = [card];
  const kotlin = generateCompositionKotlin(project);
  const companionStart = kotlin.indexOf('private companion object {');
  const buildStart = kotlin.indexOf('fun build()');
  assert.ok(companionStart >= 0 && companionStart < buildStart);
  assert.match(kotlin, /private val relInstanceRuneOffsetNode = RelativeLocation\(1\.0, 0\.0, 0\.0\)/);
  assert.match(kotlin, /private val builderInstanceRune: PointsBuilder = PointsBuilder\(\)/);
  assert.doesNotMatch(kotlin, /private private/);
});

test('composition 同一实例 ID 的不同快照内容会使用独立模板', async () => {
  const { generateCompositionKotlin } = await import('../src/modules/composition/codegen.js');
  const { createCompositionProject, createCompositionCard } = await import('../src/modules/composition/defaults.js');
  const project = createCompositionProject({ cards: [] });
  const makeCard = (radius, name) => {
    const card = createCompositionCard({ name });
    card.builderState.state.builderSnapshots = {
      shared: { id: 'shared', children: [{ id: 'circle', kind: 'add_circle', params: { r: radius, count: 4 }, children: [], terms: [] }] }
    };
    card.builderState.state.root.children = [{
      id: `ref${radius}`,
      kind: 'builder_reference',
      params: {
        snapshotId: 'shared',
        instanceMode: 'static',
        ox: 0, oy: 0, oz: 0,
        scale: 1, rotationDeg: 0,
        rotationAxisX: 0, rotationAxisY: 1, rotationAxisZ: 0
      }
    }];
    return card;
  };
  project.cards = [makeCard(2, '半径 2'), makeCard(3, '半径 3')];
  const kotlin = generateCompositionKotlin(project);
  assert.match(kotlin, /builderInstanceCard1Shared/);
  assert.match(kotlin, /builderInstanceCard2Shared/);
  assert.match(kotlin, /builderInstanceCard1Shared[\s\S]*?addCircle\(2\.0, 4\)/);
  assert.match(kotlin, /builderInstanceCard2Shared[\s\S]*?addCircle\(3\.0, 4\)/);
});
