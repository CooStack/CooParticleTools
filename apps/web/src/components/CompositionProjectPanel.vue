<template>
  <div class="project-section">
    <section class="section-block">
      <div class="section-title">项目设置</div>
      <div class="grid2">
        <label class="field">
          <span>项目名称</span>
          <input v-model="project.name" class="input" type="text" placeholder="NewComposition" />
        </label>
        <label class="field">
          <span>类型</span>
          <select v-model="project.compositionType" class="input">
            <option value="particle">ParticleComposition</option>
            <option value="sequenced">SequencedParticleComposition</option>
          </select>
        </label>
        <label class="field">
          <span>消散延迟 (tick)</span>
          <input v-model.number="project.disabledInterval" class="input" type="number" min="0" step="1" />
        </label>
        <label class="field">
          <span>播放时长 (tick, 不含消散)</span>
          <input v-model.number="project.previewPlayTicks" class="input" type="number" min="1" step="1" />
        </label>
      </div>

      <div class="subgroup">
        <div class="subgroup-title">生成前 Axis</div>
        <div class="grid2">
          <label class="field">
            <span>axis 预设</span>
            <select v-model="project.compositionAxisPreset" class="input" @change="project.compositionAxisExpr = project.compositionAxisPreset">
              <option v-for="preset in relativeTargetPresets" :key="preset.expr" :value="preset.expr">{{ preset.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>axis 输入</span>
            <input v-model="project.compositionAxisExpr" class="input mono" type="text" placeholder="axis 表达式" />
          </label>
        </div>
        <div class="grid5 vector-inputs">
          <select v-model="project.compositionAxisManualCtor" class="input vector-ctor">
            <option v-for="ctor in vectorCtorOptions" :key="ctor" :value="ctor">{{ ctor }}</option>
          </select>
          <input v-model.number="project.compositionAxisManualX" class="input" type="number" step="0.1" placeholder="0" />
          <input v-model.number="project.compositionAxisManualY" class="input" type="number" step="0.1" placeholder="1" />
          <input v-model.number="project.compositionAxisManualZ" class="input" type="number" step="0.1" placeholder="0" />
          <button class="btn small primary" @click="applyProjectAxisManual">套用手动输入</button>
        </div>
        <div class="mini-note">旧站语义：生成前 Axis 会参与根显示动作与整体方向计算。</div>
      </div>

      <label class="field">
        <span>项目描述</span>
        <textarea v-model="project.description" class="input" placeholder="项目描述"></textarea>
      </label>
    </section>

    <section class="section-block">
      <div class="card-title-row">
        <span class="section-title">全局变量</span>
        <div class="card-title-row-actions">
          <button class="btn small" @click="$emit('add-var')">添加</button>
        </div>
      </div>
      <div class="kv-list">
        <div v-if="!project.globalVars.length" class="mini-note">暂无全局变量。</div>
        <div
          v-for="(item, index) in project.globalVars"
          :key="item.id || index"
          class="kv-row grid-var"
          :class="{ 'grid-var-vector': isVectorType(item.type) }"
        >
          <div class="grid2">
            <input v-model="item.name" class="input" type="text" placeholder="变量名" />
            <select v-model="item.type" class="input" @change="normalizeTypedLiteral(item)">
              <option v-for="type in varTypes" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>

          <input
            v-model="item.value"
            class="input mono"
            type="text"
            :placeholder="isVectorType(item.type) ? 'Vec3(0, 0, 0)' : '值 / 表达式'"
            @blur="normalizeTypedLiteral(item)"
          />

          <div v-if="isVectorType(item.type)" class="vector-inputs inline-vector-inputs">
            <div class="vector-ctor-label">{{ item.type }}</div>
            <input
              class="input"
              type="number"
              step="0.1"
              :value="vectorLiteralParts(item).x"
              placeholder="x"
              @input="updateVectorLiteral(item, 'x', $event.target.value)"
            />
            <input
              class="input"
              type="number"
              step="0.1"
              :value="vectorLiteralParts(item).y"
              placeholder="y"
              @input="updateVectorLiteral(item, 'y', $event.target.value)"
            />
            <input
              class="input"
              type="number"
              step="0.1"
              :value="vectorLiteralParts(item).z"
              placeholder="z"
              @input="updateVectorLiteral(item, 'z', $event.target.value)"
            />
            <input
              v-if="item.type === 'Vector3f'"
              class="input vector-color"
              type="color"
              :value="vectorColorHex(item)"
              title="打开调色板"
              @input="updateVectorColor(item, $event.target.value)"
            />
            <div v-else class="vector-color-placeholder"></div>
          </div>

          <div class="row-actions">
            <label class="chk">
              <input v-model="item.mutable" type="checkbox" />
              <span>mutable</span>
            </label>
            <label class="chk">
              <input v-model="item.codec" type="checkbox" />
              <span>codec</span>
            </label>
            <button class="btn small" @click="$emit('remove-var', item.id)">删除</button>
          </div>
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="card-title-row">
        <span class="section-title">全局常量</span>
        <div class="card-title-row-actions">
          <button class="btn small" @click="$emit('add-const')">添加</button>
        </div>
      </div>
      <div class="kv-list">
        <div v-if="!project.globalConsts.length" class="mini-note">暂无全局常量。</div>
        <div
          v-for="(item, index) in project.globalConsts"
          :key="item.id || index"
          class="kv-row grid-var"
          :class="{ 'grid-var-vector': isVectorType(item.type) }"
        >
          <div class="grid2">
            <input v-model="item.name" class="input" type="text" placeholder="常量名" />
            <select v-model="item.type" class="input" @change="normalizeTypedLiteral(item)">
              <option v-for="type in varTypes" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>

          <input
            v-model="item.value"
            class="input mono"
            type="text"
            :placeholder="isVectorType(item.type) ? 'RelativeLocation(0, 0, 0)' : '值'"
            @blur="normalizeTypedLiteral(item)"
          />

          <div v-if="isVectorType(item.type)" class="vector-inputs inline-vector-inputs">
            <div class="vector-ctor-label">{{ item.type }}</div>
            <input
              class="input"
              type="number"
              step="0.1"
              :value="vectorLiteralParts(item).x"
              placeholder="x"
              @input="updateVectorLiteral(item, 'x', $event.target.value)"
            />
            <input
              class="input"
              type="number"
              step="0.1"
              :value="vectorLiteralParts(item).y"
              placeholder="y"
              @input="updateVectorLiteral(item, 'y', $event.target.value)"
            />
            <input
              class="input"
              type="number"
              step="0.1"
              :value="vectorLiteralParts(item).z"
              placeholder="z"
              @input="updateVectorLiteral(item, 'z', $event.target.value)"
            />
            <input
              v-if="item.type === 'Vector3f'"
              class="input vector-color"
              type="color"
              :value="vectorColorHex(item)"
              title="打开调色板"
              @input="updateVectorColor(item, $event.target.value)"
            />
            <div v-else class="vector-color-placeholder"></div>
          </div>

          <div class="row-actions">
            <button class="btn small" @click="$emit('remove-const', item.id)">删除</button>
          </div>
        </div>
      </div>
    </section>

    <section v-if="isSequenced" class="section-block">
      <div class="card-title-row">
        <span class="section-title">Composition Animates</span>
        <div class="card-title-row-actions">
          <button class="btn small" @click="$emit('add-animate')">添加</button>
        </div>
      </div>
      <div class="kv-list">
        <div v-if="!project.compositionAnimates.length" class="mini-note">Sequenced 模式下可通过条件表达式控制可见卡片数量。</div>
        <div v-for="(item, index) in project.compositionAnimates" :key="item.id || index" class="kv-row grid-animate">
          <input v-model.number="item.count" class="input" type="number" min="1" step="1" />
          <input v-model="item.condition" class="input mono" type="text" placeholder="条件表达式" />
          <button class="btn small" @click="$emit('remove-animate', item.id)">删除</button>
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="card-title-row">
        <span class="section-title">根显示动作</span>
        <div class="card-title-row-actions">
          <button class="btn small" @click="$emit('add-display-action')">添加 display action</button>
        </div>
      </div>
      <div class="kv-list">
        <div v-if="!project.displayActions.length" class="mini-note">暂无根显示动作。</div>
        <div v-for="(item, index) in project.displayActions" :key="item.id || index" class="kv-row">
          <div class="grid-action">
            <select v-model="item.type" class="input">
              <option v-for="type in displayActionTypes" :key="type.id" :value="type.id">{{ type.label }}</option>
            </select>
            <select v-model="item.toPreset" class="input" @change="syncDisplayPreset(item)">
              <option v-for="preset in relativeTargetPresets" :key="preset.expr" :value="preset.expr">{{ preset.label }}</option>
            </select>
            <input v-model="item.toExpr" class="input mono" type="text" placeholder="to 表达式" />
            <button class="btn small" @click="$emit('remove-display-action', item.id)">删除</button>
          </div>

          <template v-if="item.type !== 'rotateAsAxis'">
            <div class="grid5 vector-inputs">
              <select v-model="item.toManualCtor" class="input vector-ctor">
                <option v-for="ctor in vectorCtorOptions" :key="ctor" :value="ctor">{{ ctor }}</option>
              </select>
              <input v-model.number="item.toManualX" class="input" type="number" step="0.1" placeholder="0" />
              <input v-model.number="item.toManualY" class="input" type="number" step="0.1" placeholder="1" />
              <input v-model.number="item.toManualZ" class="input" type="number" step="0.1" placeholder="0" />
              <button class="btn small primary" @click="applyDisplayManual(item)">套用手动输入</button>
            </div>
          </template>

          <div class="angle-control">
            <div class="angle-control-main">
              <select v-model="item.angleMode" class="input" style="max-width: 140px;">
                <option value="numeric">角度输入</option>
                <option value="expr">表达式</option>
              </select>
              <template v-if="item.angleMode === 'numeric'">
                <input v-model.number="item.angleValue" class="input angle-value" type="number" step="0.01" />
                <select v-model="item.angleUnit" class="input angle-unit">
                  <option value="deg">度</option>
                  <option value="rad">弧度</option>
                </select>
              </template>
            </div>
            <template v-if="item.angleMode === 'expr'">
              <div class="grid2">
                <select v-model="item.angleExprPreset" class="input" @change="item.angleExpr = item.angleExprPreset">
                  <option v-for="preset in anglePresets" :key="preset" :value="preset">{{ preset }}</option>
                </select>
                <input v-model="item.angleExpr" class="input mono" type="text" placeholder="角度表达式" />
              </div>
            </template>
          </div>

          <label class="field editor-field">
            <span>表达式脚本</span>
            <textarea v-model="item.expression" class="input" placeholder="可选：附加显示动作表达式"></textarea>
          </label>
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="card-title-row">
        <span class="section-title">项目仓库</span>
        <div class="card-title-row-actions">
          <button class="btn small primary" @click="$emit('persist-project')">保存到仓库</button>
          <button class="btn small" @click="$emit('download-code')">下载 .kt</button>
        </div>
      </div>
      <div class="kv-list">
        <div v-if="!serverProjects.length" class="mini-note">当前仓库中还没有 Composition 项目。</div>
        <div v-for="item in serverProjects" :key="item.id" class="kv-row">
          <div class="card-title-row">
            <div>
              <div style="font-weight: 700;">{{ item.name }}</div>
              <div class="mini-note">{{ item.description || '无描述' }}</div>
            </div>
            <div class="card-title-row-actions">
              <button class="btn small" @click="$emit('load-server-project', item)">加载</button>
              <button class="btn small" @click="$emit('delete-server-project', item)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { COMPOSITION_GLOBAL_VAR_TYPES } from '../modules/composition/defaults.js';
import {
  defaultLiteralForType,
  formatVectorLiteral,
  isVectorType,
  parseVectorLiteral
} from '../modules/composition/expression-runtime.js';

const props = defineProps({
  project: { type: Object, required: true },
  serverProjects: { type: Array, default: () => [] },
  relativeTargetPresets: { type: Array, default: () => [] },
  anglePresets: { type: Array, default: () => [] },
  displayActionTypes: { type: Array, default: () => [] }
});

defineEmits([
  'persist-project',
  'download-code',
  'add-var',
  'remove-var',
  'add-const',
  'remove-const',
  'add-animate',
  'remove-animate',
  'add-display-action',
  'remove-display-action',
  'load-server-project',
  'delete-server-project'
]);

const varTypes = COMPOSITION_GLOBAL_VAR_TYPES;
const vectorCtorOptions = ['Vec3', 'RelativeLocation', 'Vector3f'];
const isSequenced = computed(() => props.project.compositionType === 'sequenced');

function syncDisplayPreset(item) {
  item.toUsePreset = true;
  item.toExpr = item.toPreset;
}

function applyProjectAxisManual() {
  props.project.compositionAxisExpr = formatVectorLiteral(
    props.project.compositionAxisManualCtor,
    props.project.compositionAxisManualX,
    props.project.compositionAxisManualY,
    props.project.compositionAxisManualZ
  );
  props.project.compositionAxisPreset = props.project.compositionAxisExpr;
}

function applyDisplayManual(item) {
  item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
  item.toPreset = item.toExpr;
  item.toUsePreset = false;
}

function normalizeTypedLiteral(item) {
  if (!item) return;
  const type = String(item.type || 'Double').trim();
  const rawValue = String(item.value ?? '').trim();
  if (!rawValue) {
    item.value = defaultLiteralForType(type);
    return;
  }
  if (isVectorType(type)) {
    const parsed = parseVectorLiteral(rawValue, { x: 0, y: 0, z: 0 });
    item.value = formatVectorLiteral(type, parsed.x, parsed.y, parsed.z);
    return;
  }
  if (type === 'Boolean') {
    item.value = /^true$/i.test(rawValue) ? 'true' : 'false';
    return;
  }
  if (type === 'Int' || type === 'Long') {
    item.value = String(Math.round(toFiniteNumber(rawValue, 0)));
    return;
  }
  if (type === 'Float' || type === 'Double') {
    item.value = String(toFiniteNumber(rawValue, 0));
    return;
  }
  item.value = String(item.value ?? '');
}

function vectorLiteralParts(item) {
  return parseVectorLiteral(item?.value, { x: 0, y: 0, z: 0 });
}

function updateVectorLiteral(item, axis, value) {
  if (!item || !isVectorType(item.type)) return;
  const parsed = vectorLiteralParts(item);
  parsed[axis] = toFiniteNumber(value, 0);
  item.value = formatVectorLiteral(item.type, parsed.x, parsed.y, parsed.z);
}

function updateVectorColor(item, hex) {
  if (!item || String(item.type || '').trim() !== 'Vector3f') return;
  const color = hexToVector01(hex);
  item.value = formatVectorLiteral('Vector3f', color.x, color.y, color.z);
}

function vectorColorHex(item) {
  const parsed = vectorLiteralParts(item);
  return vectorToHex01(parsed.x, parsed.y, parsed.z);
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, toFiniteNumber(value, 0)));
}

function toHexChannel(value) {
  return Math.round(clamp01(value) * 255).toString(16).padStart(2, '0');
}

function vectorToHex01(x = 0, y = 0, z = 0) {
  return `#${toHexChannel(x)}${toHexChannel(y)}${toHexChannel(z)}`;
}

function hexToVector01(hex) {
  const normalized = String(hex || '').trim().replace('#', '');
  const source = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  return {
    x: parseInt(source.slice(0, 2), 16) / 255,
    y: parseInt(source.slice(2, 4), 16) / 255,
    z: parseInt(source.slice(4, 6), 16) / 255
  };
}
</script>
