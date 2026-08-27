<template>
  <div class="parameter-value-field" :class="{ 'parameter-value-field--vector': vectorType }">
    <div class="parameter-value-head">
      <span>{{ label }}</span>
      <label v-if="item.type === 'Vector3f'" class="check-row parameter-color-mode">
        <input :checked="colorMode" type="checkbox" @change="setColorMode($event.target.checked)" />
        颜色模式
      </label>
    </div>

    <select v-if="item.type === 'Boolean'" v-model="item.value" class="input" :aria-label="label">
      <option :value="false">false</option>
      <option :value="true">true</option>
    </select>

    <div v-else-if="vectorType" class="parameter-vector-editor">
      <!-- @input="updateColor($event.target.value)" @change="commitColor" -->
      <VectorInput
        :model-value="item.value"
        :type="item.type"
        :labels="colorMode ? ['R', 'G', 'B'] : ['X', 'Y', 'Z']"
        :color-mode="colorMode"
        :step="colorMode ? 0.01 : 'any'"
        :scrub="!colorMode"
        @update:model-value="item.value = $event"
        @commit="item.value = $event"
      />
    </div>

    <NumericInput
      v-else-if="numericType"
      :model-value="item.value"
      :integer="integerType"
      :long="item.type === 'Long'"
      :step="integerType ? 1 : 'any'"
      :scrub="true"
      :placeholder="`输入${label}`"
      :aria-label="label"
      @update:model-value="updateScalarValue"
      @commit="commitScalarValue"
    />
    <input
      v-else
      class="input"
      type="text"
      :value="item.value"
      :placeholder="`输入${label}`"
      :aria-label="label"
      @input="updateScalarValue($event.target.value)"
      @change="commitScalarValue"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import NumericInput from './NumericInput.vue';
import VectorInput from './VectorInput.vue';
import {
  generatorHexToVectorValue,
  generatorVectorValueToHex,
  isGeneratorVectorType,
  normalizeGeneratorLongValue,
  parseGeneratorVectorValue,
  updateGeneratorVectorComponent
} from '../modules/generator/parameter-values.js';

const props = defineProps({
  item: { type: Object, required: true },
  label: { type: String, default: '默认值' }
});

const draftColorHex = ref(generatorVectorValueToHex(props.item.value));
const vectorType = computed(() => isGeneratorVectorType(props.item.type));
const numericType = computed(() => ['Int', 'Long', 'Float', 'Double'].includes(props.item.type));
const integerType = computed(() => ['Int', 'Long'].includes(props.item.type));
const colorMode = computed(() => props.item.type === 'Vector3f' && props.item.colorMode === true);
const vectorValue = computed(() => parseGeneratorVectorValue(
  props.item.type,
  colorMode.value ? generatorHexToVectorValue(draftColorHex.value) : props.item.value
));
const axes = computed(() => colorMode.value
  ? [{ key: 'x', label: 'R' }, { key: 'y', label: 'G' }, { key: 'z', label: 'B' }]
  : [{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }, { key: 'z', label: 'Z' }]);

function setColorMode(enabled) {
  props.item.colorMode = enabled === true;
  if (!enabled) return;
  axes.value.forEach((axis) => {
    props.item.value = updateGeneratorVectorComponent(
      props.item.type,
      props.item.value,
      axis.key,
      vectorValue.value[axis.key],
      { min: 0, max: 1 }
    );
  });
}

function updateAxis(axis, value) {
  props.item.value = updateGeneratorVectorComponent(
    props.item.type,
    props.item.value,
    axis,
    value,
    colorMode.value ? { min: 0, max: 1 } : {}
  );
  draftColorHex.value = generatorVectorValueToHex(props.item.value);
}

// The color picker keeps its draft local until change/blur. VectorInput owns the
// visible control; these helpers preserve the editor's long-standing contract.
function updateColor(hex) {
  draftColorHex.value = hex;
}

function commitColor() {
  props.item.value = generatorHexToVectorValue(draftColorHex.value);
}

function updateScalarValue(value) {
  if (props.item.type === 'Long' || props.item.type === 'String') {
    props.item.value = value;
    return;
  }
  if (!numericType.value || value === '') {
    props.item.value = value;
    return;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) props.item.value = numeric;
}

function commitScalarValue() {
  if (props.item.type === 'Long') props.item.value = normalizeGeneratorLongValue(props.item.value);
}

watch(
  () => props.item,
  () => {
    draftColorHex.value = generatorVectorValueToHex(props.item.value);
  },
  { flush: 'sync' }
);

watch(
  () => props.item.type,
  () => { draftColorHex.value = generatorVectorValueToHex(props.item.value); }
);

watch(
  () => [props.item.value, props.item.colorMode],
  () => { draftColorHex.value = generatorVectorValueToHex(props.item.value); }
);
</script>

<style scoped>
.parameter-value-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.parameter-value-field--vector {
  grid-column: 1 / -1;
}

.parameter-value-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
}

.parameter-value-head > span,
.axis-field > span {
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.25;
}

.check-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
}

.check-row input {
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  margin: 0;
}

.parameter-vector-editor,
.parameter-vector-grid {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.parameter-vector-editor--color {
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: end;
}

.parameter-vector-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.axis-field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.input {
  width: 100%;
  min-width: 0;
}

.axis-field .input {
  padding-left: 6px;
  padding-right: 6px;
  text-align: center;
}

.parameter-color-picker {
  width: 44px;
  min-width: 44px;
  height: 40px;
  min-height: 40px;
  padding: 3px;
}
</style>
