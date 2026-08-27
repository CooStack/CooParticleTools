import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createGeneratorProject } from '../src/modules/generator/defaults.js';
import { generateEmitterKotlin } from '../src/modules/generator/codegen.js';
import { generatePointsBuilderKotlin } from '../src/modules/pointsbuilder/codegen.js';
import { generatePointsBuilderKotlinParts } from '../src/modules/pointsbuilder/codegen.js';
import { createKindDefs } from '../public/legacy/assets/points_builder/js/kinds.js';
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

  assert.deepEqual(parts.constants, [
    'private const val BUILDER_SNAPSHOT_PB_INSTANCE_RUNE_INSTANCE_PARAM_ID = "pb_instance_rune_instance"'
  ]);
  assert.equal(parts.declarations.length, 1);
  assert.match(parts.declarations[0], /^private val builderInstance_rune: PointsBuilder = PointsBuilder\(\)/);
  assert.match(parts.declarations[0], /\.addCircle\(4\.0, 8\)/);
  assert.doesNotMatch(parts.declarations[0], /by lazy|createWithoutClone/);
  assert.match(
    parts.expression,
    /\.addPoints\(builderInstance_rune\.createWithTransform\(30\.0 \* PI \/ 180\.0, RelativeLocation\(1\.0, 2\.0, 3\.0\)\)\)/
  );
});

test('纯 PointsBuilder 输出让实例声明与主 Builder 并列，不使用 run 包裹', () => {
  const kotlin = generatePointsBuilderKotlin(instanceProject(0));

  assert.match(kotlin, /^private val builderInstance_rune: PointsBuilder = PointsBuilder\(\)/);
  assert.match(kotlin, /\n\nPointsBuilder\(\)/);
  assert.match(kotlin, /\.addBuilder\(RelativeLocation\(1\.0, 2\.0, 3\.0\), builderInstance_rune\)/);
  assert.doesNotMatch(kotlin, /^run \{|PointsBuilder\.of\(builderInstance_rune\)|by lazy/);
});

test('Generator 将实例常量和模板提升到类级，并保留实例 Offset', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  card.emitter.type = 'points_builder';
  card.emitter.builderState = instanceProject(0);

  const kotlin = generateEmitterKotlin(project);

  assert.equal((kotlin.match(/private companion object \{/g) || []).length, 1);
  assert.match(kotlin, /private const val BUILDER_SNAPSHOT_PB_INSTANCE_RUNE_INSTANCE_PARAM_ID/);
  assert.match(kotlin, /private val builderInstance_rune: PointsBuilder = PointsBuilder\(\)/);
  assert.match(
    kotlin,
    /\.addBuilder\(RelativeLocation\(1\.0, 2\.0, 3\.0\), builderInstance_rune\)/
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
  assert.match(kotlin, /private val builderInstance_rune: PointsBuilder = PointsBuilder\(\)/);
  assert.match(kotlin, /private fun builderInstance_rune\(radius: Double\): PointsBuilder/);
});

test('实例卡片提供 Offset、变量网格和失焦修改 ID 的完整接线', async () => {
  const [cardsSource, mainSource, styleSource] = await Promise.all([
    readFile(new URL('../public/legacy/assets/points_builder/js/cards.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/css/style.css', import.meta.url), 'utf8')
  ]);

  assert.match(cardsSource, /case "builder_reference":[\s\S]*?instanceIdInput\.addEventListener\("blur"/);
  assert.match(cardsSource, /case "builder_reference":[\s\S]*?row\("Offset", makeVec3Editor\(p, "o"/);
  assert.match(mainSource, /renderBuilderReferenceVariables,[\s\S]*?changeBuilderReferenceId,[\s\S]*?setBuilderReferenceInstanceMode/);
  assert.match(mainSource, /refreshBuilderSnapshotVariables\(snapshot, normalized\)/);
  assert.match(styleSource, /\.builder-reference-variable-panel \.preset-variable-list \{[\s\S]*?grid-template-columns: repeat\(auto-fit,/);
  assert.match(styleSource, /\.builder-reference-variable-panel \.preset-variable-name::after \{[\s\S]*?content: ":"/);
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
