<template>
  <div class="cparticle-force-editor">
    <div v-if="errors.length" class="compatibility-note compatibility-note--error">
      <strong>配置错误</strong>
      <ul><li v-for="message in errors" :key="message">{{ message }}</li></ul>
    </div>
    <div v-if="warnings.length" class="compatibility-note">
      <strong>运行时 ID 提示</strong>
      <ul><li v-for="message in warnings" :key="message">{{ message }}</li></ul>
    </div>

    <section class="editor-section">
      <CollapsibleCard v-for="(command, index) in project.forceCommands" :key="command.id" class="command-card" :title="command.label || command.force.type">
        <template #actions>
          <label class="check-row"><input v-model="command.enabled" type="checkbox" />启用</label>
          <div class="inline-actions">
            <button class="icon-btn" type="button" aria-label="上移" :disabled="index === 0" @click="moveForceCommand(index, -1)">
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.2 7.6 3.8-3.8 3.8 3.8" /></svg>
            </button>
            <button class="icon-btn" type="button" aria-label="下移" :disabled="index === project.forceCommands.length - 1" @click="moveForceCommand(index, 1)">
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.2 4.4 3.8 3.8 3.8-3.8" /></svg>
            </button>
            <button class="icon-btn" type="button" title="删除 Force Command" aria-label="删除 Force Command" @click="removeForceCommand(command.id)">
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 3.5h7M4.2 3.5v6h3.6v-6M4.5 2h3M5 5v3M7 5v3" /></svg>
            </button>
          </div>
        </template>
        <div class="grid2">
          <label class="field"><span>名称</span><input v-model="command.label" class="input" type="text" /></label>
          <label class="field"><span>Force 类型</span><select v-model="command.force.type" class="input force-select" @change="syncForceType(command)"><option v-for="item in forceTypes" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
        </div>

        <div v-if="forceParameterFields(command).length" class="command-param-grid">
          <template v-for="field in forceParameterFields(command)" :key="field.key">
            <div v-if="field.type === 'vec3'" class="force-vector-field">
              <GeneratorParameterValueEditor :item="forceVectorItem(command, field)" :label="field.label" />
              <label v-if="field.expressionKey" class="field force-vector-expression">
                <span>Kotlin 表达式（可选）</span>
                <input v-model="command.force.parameters[field.expressionKey]" class="input" type="text" :placeholder="field.placeholder" />
              </label>
            </div>
            <label v-else class="mini-field">
              <span>{{ field.label }}</span>
              <select v-if="field.type === 'select'" v-model="command.force.parameters[field.key]" class="input force-select">
                <option v-for="option in field.options" :key="String(option.value)" :value="option.value">{{ option.label }}</option>
              </select>
              <select v-else-if="field.type === 'boolean'" class="input force-select" :value="String(command.force.parameters[field.key])" @change="command.force.parameters[field.key] = $event.target.value === 'true'">
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </select>
              <select v-else-if="field.type === 'resource'" v-model="command.force.parameters[field.key]" class="input force-select">
                <option value="">请选择</option>
                <option v-for="resource in resourcesByKind(field.resourceKind)" :key="resource.id" :value="resource.id">{{ resource.name }} · {{ resource.location || '未填写' }}</option>
              </select>
              <NumericInput
                v-else
                :model-value="command.force.parameters[field.key]"
                :step="field.step || '0.01'"
                :min="field.min"
                :max="field.max"
                :integer="field.step === 1 || field.step === '1'"
                :placeholder="field.type === 'optional-number' ? '留空 = Infinity' : ''"
                @update:model-value="updateNumberParameter(command, field, $event)"
                @commit="commitNumberParameter(command, field, $event)"
              />
            </label>
          </template>
        </div>

        <div class="selector-editor">
          <label class="field"><span>Selector</span><select v-model="command.selector.type" class="input force-select" @change="syncSelectorType(command)"><option v-for="item in selectorTypes" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
          <template v-if="command.selector.type === 'SourceEquals' || command.selector.type === 'SourceMask'">
            <label class="field"><span>sourceId（运行时 Int）</span><NumericInput :model-value="command.selector.sourceId" integer :step="1" @update:model-value="command.selector.sourceId = toNumber($event, true)" /></label>
            <label v-if="command.selector.type === 'SourceMask'" class="field"><span>sourceMask</span><NumericInput :model-value="command.selector.sourceMask" integer :step="1" @update:model-value="command.selector.sourceMask = toNumber($event, true)" /></label>
            <div class="compatibility-note compatibility-note--error">sourceId 由运行时 system 分配，不是持久化 emitter ID；不要填写 UUID、字符串 ID 或资源 ID。</div>
          </template>
          <template v-else-if="command.selector.type === 'SignEquals' || command.selector.type === 'SignMask'">
            <label class="field"><span>sign</span><select v-model="command.selector.signRef" class="input force-select"><option value="">请选择</option><option v-for="sign in project.signs" :key="sign.id" :value="sign.id">{{ sign.name }} = {{ sign.value }}</option></select></label>
            <label v-if="command.selector.type === 'SignMask'" class="field"><span>signMask</span><NumericInput :model-value="command.selector.signMask" integer :step="1" @update:model-value="command.selector.signMask = toNumber($event, true)" /></label>
          </template>
          <div v-else-if="command.selector.type === 'CommandMask'" class="mask-choice-list">
            <span class="sub">匹配任意已选 commandMask 位</span>
            <label v-for="mask in project.commandMasks" :key="mask.id" class="check-row"><input type="checkbox" :checked="command.selector.commandMaskRefs.includes(mask.id)" @change="toggleRef(command.selector.commandMaskRefs, mask.id, $event.target.checked)" />{{ mask.name }} = {{ mask.value }}</label>
          </div>
        </div>
      </CollapsibleCard>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import GeneratorParameterValueEditor from './GeneratorParameterValueEditor.vue';
import NumericInput from './NumericInput.vue';
import CollapsibleCard from './CollapsibleCard.vue';
import {
  CPARTICLE_FORCE_TYPE_OPTIONS,
  CPARTICLE_SELECTOR_OPTIONS,
  collectCParticleForceErrors,
  collectCParticleForceWarnings,
  createDefaultCParticleForceParameters
} from '../modules/generator/defaults.js';
import {
  formatGeneratorVectorValue,
  parseGeneratorVectorValue
} from '../modules/generator/parameter-values.js';

const props = defineProps({
  project: { type: Object, required: true }
});

const forceTypes = CPARTICLE_FORCE_TYPE_OPTIONS;
const selectorTypes = CPARTICLE_SELECTOR_OPTIONS;
const errors = computed(() => collectCParticleForceErrors(props.project).filter((message) => !isMaskDefinitionError(message)));
const warnings = computed(() => collectCParticleForceWarnings(props.project));
const vectorItemCache = new WeakMap();

function isMaskDefinitionError(message) {
  return message.startsWith('sign 标签')
    || message.startsWith('commandMask')
    || (/^发射器/.test(message) && /sign 标签|commandMask/.test(message));
}

function forceParameterFields(command) {
  const fields = forceTypes.find((item) => item.id === command.force?.type)?.params || [];
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const consumed = new Set();
  const result = [];
  for (const field of fields) {
    if (consumed.has(field.key)) continue;
    const prefix = vectorPrefix(field, byKey);
    if (!prefix) {
      result.push(field);
      continue;
    }
    const expression = byKey.get(`${prefix}Expression`);
    const x = byKey.get(`${prefix}X`);
    const y = byKey.get(`${prefix}Y`);
    const z = byKey.get(`${prefix}Z`);
    consumed.add(x.key);
    consumed.add(y.key);
    consumed.add(z.key);
    if (expression) consumed.add(expression.key);
    result.push({
      key: `vec3:${prefix}`,
      type: 'vec3',
      prefix,
      label: x.label.replace(/\s+X$/, ''),
      expressionKey: expression?.key || '',
      placeholder: expression?.placeholder || ''
    });
  }
  return result;
}

function vectorPrefix(field, byKey) {
  const expressionMatch = field.type === 'kotlin' ? field.key.match(/^(.*)Expression$/) : null;
  const xMatch = field.type === 'number' ? field.key.match(/^(.*)X$/) : null;
  const prefix = expressionMatch?.[1] || xMatch?.[1] || '';
  if (!prefix) return '';
  return byKey.has(`${prefix}X`) && byKey.has(`${prefix}Y`) && byKey.has(`${prefix}Z`)
    ? prefix
    : '';
}

function forceVectorItem(command, field) {
  let items = vectorItemCache.get(command);
  if (!items) {
    items = new Map();
    vectorItemCache.set(command, items);
  }
  if (!items.has(field.prefix)) {
    const item = { type: 'Vec3' };
    Object.defineProperty(item, 'value', {
      enumerable: true,
      get() {
        const parameters = command.force.parameters;
        return formatGeneratorVectorValue('Vec3', {
          x: parameters[`${field.prefix}X`],
          y: parameters[`${field.prefix}Y`],
          z: parameters[`${field.prefix}Z`]
        });
      },
      set(value) {
        const vector = parseGeneratorVectorValue('Vec3', value);
        const parameters = command.force.parameters;
        parameters[`${field.prefix}X`] = vector.x;
        parameters[`${field.prefix}Y`] = vector.y;
        parameters[`${field.prefix}Z`] = vector.z;
      }
    });
    items.set(field.prefix, item);
  }
  return items.get(field.prefix);
}

function resourcesByKind(kind) {
  return props.project.forceResources.filter((item) => item.kind === kind);
}

function removeForceCommand(id) {
  const index = props.project.forceCommands.findIndex((item) => item.id === id);
  if (index >= 0) props.project.forceCommands.splice(index, 1);
}

function moveForceCommand(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= props.project.forceCommands.length) return;
  const [command] = props.project.forceCommands.splice(index, 1);
  props.project.forceCommands.splice(next, 0, command);
}

function syncForceType(command) {
  command.label = command.force.type;
  command.force.parameters = createDefaultCParticleForceParameters(command.force.type);
}

function syncSelectorType(command) {
  command.selector = {
    type: command.selector.type,
    sourceId: 0,
    sourceMask: -1,
    signRef: '',
    signMask: -1,
    commandMaskRefs: []
  };
}

function toggleRef(refs, id, checked) {
  const index = refs.indexOf(id);
  if (checked && index < 0) refs.push(id);
  if (!checked && index >= 0) refs.splice(index, 1);
}

function toNumber(value, integer = false) {
  if (value === '' || value == null) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return integer ? Math.trunc(numeric) : numeric;
}

function updateNumberParameter(command, field, value) {
  if (value === '' && field.type === 'optional-number') {
    command.force.parameters[field.key] = '';
    return;
  }
  if (value === '') return;
  const numeric = toNumber(value, field.step === 1 || field.step === '1');
  command.force.parameters[field.key] = numeric;
}

function commitNumberParameter(command, field, value) {
  if (value === '') {
    command.force.parameters[field.key] = field.type === 'optional-number' ? '' : 0;
    return;
  }
  command.force.parameters[field.key] = toNumber(value, field.step === 1 || field.step === '1');
}
</script>

<style scoped>
.cparticle-force-editor {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.editor-section {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.command-card {
  min-width: 0;
  padding: 0;
}

.command-card .grid2,
.selector-editor {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.command-param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius3, 10px);
  background: color-mix(in srgb, var(--panel2, #12171d) 72%, transparent);
}

.selector-editor {
  padding: 12px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius3, 10px);
  background: color-mix(in srgb, var(--panel2, #12171d) 66%, transparent);
}

.mask-choice-list {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius3, 10px);
  background: color-mix(in srgb, var(--card2, #181f26) 80%, transparent);
}

.command-card .inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.command-card .icon-btn {
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  padding: 0;
  border: 1px solid var(--line2, rgba(255, 255, 255, 0.14));
  border-radius: var(--radius3, 10px);
  color: var(--text, #ecf0f5);
  background: color-mix(in srgb, var(--card2, #181f26) 88%, transparent);
  line-height: 1;
  transition: border-color var(--speed, 140ms) ease, background var(--speed, 140ms) ease,
    color var(--speed, 140ms) ease;
}

.command-card .icon-btn svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.command-card .icon-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent, #8fa7b8) 56%, var(--line2, transparent));
  background: color-mix(in srgb, var(--accent, #8fa7b8) 16%, var(--card2, #181f26));
}

.command-card .icon-btn:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--accent, #8fa7b8) 60%, transparent);
  box-shadow: var(--focus-ring, 0 0 0 3px rgb(143 167 184 / 22%));
}

.command-card .icon-btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.force-select {
  min-width: 0;
}

/* The shared custom-select enhancer replaces the native element with a
 * `.cp-select` trigger. Keep the generated wrapper aligned with the field
 * grid, while retaining the native select as a progressive-enhancement
 * fallback when the enhancer is unavailable. */
:deep(.cp-select) {
  display: flex;
  width: 100%;
  min-width: 0;
}

:deep(.cp-select-trigger) {
  min-height: 40px;
  border-radius: var(--radius2, 12px);
}

.field,
.mini-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.field > span,
.mini-field > span {
  color: var(--muted, #808b99);
  font-size: 12px;
  line-height: 1.3;
}

.force-vector-field {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius3, 10px);
  background: color-mix(in srgb, var(--card2, #181f26) 80%, transparent);
}

.force-vector-expression {
  margin-top: 2px;
}

.compatibility-note ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.compatibility-note {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--warning, #b49363) 34%, var(--line, transparent));
  border-left: 3px solid var(--warning, #b49363);
  border-radius: var(--radius3, 10px);
  color: var(--muted, #808b99);
  background: color-mix(in srgb, var(--warning, #b49363) 10%, transparent);
  font-size: 12px;
  line-height: 1.5;
}

.compatibility-note--error {
  border-color: color-mix(in srgb, var(--danger, #c96f62) 36%, var(--line, transparent));
  border-left-color: var(--danger, #c96f62);
  color: color-mix(in srgb, var(--danger, #c96f62) 78%, white 22%);
  background: color-mix(in srgb, var(--danger, #c96f62) 12%, transparent);
}

@media (max-width: 720px) {
  .command-card .grid2,
  .command-param-grid {
    grid-template-columns: 1fr;
  }
}

</style>
