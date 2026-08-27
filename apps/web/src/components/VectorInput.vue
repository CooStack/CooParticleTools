<template>
  <div class="vector-input" :class="{ 'vector-input--color': colorMode }">
    <div v-if="colorMode" class="vector-input__color-main">
      <input
        class="vector-input__picker input"
        type="color"
        :value="pickerColorHex"
        aria-label="选择颜色"
        title="调色板"
        @input="updateColorDraft($event.target.value)"
        @change="commitColor($event.target.value)"
      />
      <input
        class="vector-input__color-text input"
        type="text"
        inputmode="text"
        :value="colorHex"
        placeholder="#RRGGBB"
        aria-label="颜色十六进制值"
        @input="updateColorDraft($event.target.value)"
        @keydown.enter.prevent="commitColor($event.target.value)"
        @blur="commitColor($event.target.value)"
      />
    </div>
    <div class="vector-input__grid">
      <label v-for="axis in axes" :key="axis.key" class="vector-input__cell">
        <span>{{ axis.label }}</span>
        <NumericInput
          :model-value="vector[axis.key]"
          :step="step"
          :min="colorMode ? 0 : min"
          :max="colorMode ? 1 : max"
          :scrub="scrub"
          :integer="integer"
          :aria-label="axis.label"
          @update:model-value="updateAxis(axis.key, $event)"
          @commit="commitAxis(axis.key, $event)"
        />
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import NumericInput from './NumericInput.vue';
import {
  generatorHexToVectorValue,
  generatorVectorValueToHex,
  parseGeneratorVectorValue,
  updateGeneratorVectorComponent
} from '../modules/generator/parameter-values.js';

const props = defineProps({
  modelValue: { type: [String, Object, Array], default: '' },
  type: { type: String, default: 'Vec3' },
  labels: { type: Array, default: () => ['X', 'Y', 'Z'] },
  colorMode: { type: Boolean, default: false },
  step: { type: [String, Number], default: 0.01 },
  min: { type: [String, Number], default: undefined },
  max: { type: [String, Number], default: undefined },
  integer: { type: Boolean, default: false },
  scrub: { type: Boolean, default: true }
});

const emit = defineEmits(['update:modelValue', 'commit']);
const draftColorHex = ref('');
const axes = computed(() => [
  { key: 'x', label: props.labels[0] || 'X' },
  { key: 'y', label: props.labels[1] || 'Y' },
  { key: 'z', label: props.labels[2] || 'Z' }
]);
const vector = computed(() => parseGeneratorVectorValue(
  props.type,
  props.colorMode && isColorHex(draftColorHex.value)
    ? generatorHexToVectorValue(draftColorHex.value)
    : props.modelValue
));
const colorHex = computed(() => draftColorHex.value || generatorVectorValueToHex(props.modelValue));
const pickerColorHex = computed(() => isColorHex(colorHex.value) ? normalizeColorHex(colorHex.value) : generatorVectorValueToHex(props.modelValue));

watch(() => [props.modelValue, props.colorMode], ([nextValue, nextMode], [prevValue, prevMode] = []) => {
  if (nextMode !== prevMode) {
    draftColorHex.value = '';
    return;
  }
  const nextHex = generatorVectorValueToHex(nextValue);
  if (!draftColorHex.value || nextHex !== draftColorHex.value) draftColorHex.value = '';
}, { flush: 'sync' });

function updateAxis(axis, value) {
  if (value === '' || !Number.isFinite(Number(value))) return;
  const next = nextVectorValue(axis, value);
  emit('update:modelValue', next);
  return next;
}

function nextVectorValue(axis, value) {
  return updateGeneratorVectorComponent(props.type, props.modelValue, axis, value, {
    min: props.colorMode ? 0 : props.min,
    max: props.colorMode ? 1 : props.max
  });
}

function commitAxis(axis, value) {
  if (value === '' || !Number.isFinite(Number(value))) return;
  const next = nextVectorValue(axis, value);
  emit('commit', next);
}

function updateColorDraft(hex) {
  const value = String(hex ?? '').trim();
  draftColorHex.value = value;
  if (isColorHex(value)) emit('update:modelValue', generatorHexToVectorValue(value));
}

function commitColor(value = '') {
  const candidate = String(value || draftColorHex.value || '').trim();
  const hex = isColorHex(candidate) ? normalizeColorHex(candidate) : generatorVectorValueToHex(props.modelValue);
  if (!isColorHex(hex)) return;
  const next = generatorHexToVectorValue(hex);
  draftColorHex.value = '';
  emit('update:modelValue', next);
  emit('commit', next);
}

function isColorHex(value) {
  return /^#?[0-9a-fA-F]{6}$/.test(String(value || '').trim());
}

function normalizeColorHex(value) {
  const text = String(value || '').trim();
  return text.startsWith('#') ? text : `#${text}`;
}
</script>

<style scoped>
.vector-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  width: 100%;
  container-type: inline-size;
}

.vector-input--color {
  grid-template-columns: minmax(0, 1fr);
}

.vector-input__color-main {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.vector-input__picker {
  width: 48px;
  min-width: 48px;
  height: 40px;
  min-height: 40px;
  padding: 3px;
}

.vector-input__color-text {
  min-width: 0;
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.03em;
}

.vector-input__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.vector-input__cell {
  display: grid;
  gap: 4px;
  min-width: 0;
}

@container (max-width: 300px) {
  .vector-input__grid {
    gap: 4px;
  }

  .vector-input--color {
    grid-template-columns: minmax(0, 1fr);
  }

  .vector-input__color-main {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .vector-input__picker {
    width: 40px;
    min-width: 40px;
  }
}

.vector-input__cell > span {
  color: var(--text-soft, var(--muted, #808b99));
  font-size: 12px;
  line-height: 1.2;
}
</style>
