<template>
  <div class="numeric-input" :class="{ 'numeric-input--disabled': disabled }">
    <input
      ref="inputRef"
      class="numeric-input__field input"
      :value="draftValue"
      :type="inputType"
      :disabled="disabled"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :inputmode="integer || long ? 'numeric' : 'decimal'"
      :step="step || 'any'"
      :min="min"
      :max="max"
      :role="long ? undefined : 'spinbutton'"
      :aria-valuenow="long || !Number.isFinite(Number(draftValue)) ? undefined : String(Number(draftValue))"
      :aria-valuemin="long ? undefined : min"
      :aria-valuemax="long ? undefined : max"
      autocomplete="off"
      @input="handleInput"
      @blur="commit"
      @keydown="handleKeydown"
    />
    <div
      class="numeric-input__stepper"
      :class="{ 'numeric-input__stepper--disabled': !canStep }"
      role="presentation"
      aria-hidden="true"
      @pointerdown="startStepperScrub"
      @pointerup="finishScrub"
      @pointercancel="finishScrub"
      @contextmenu.prevent
    >
      <span class="numeric-input__step numeric-input__step--up"><svg viewBox="0 0 12 12"><path d="m2.2 7.6 3.8-3.8 3.8 3.8" /></svg></span>
      <span class="numeric-input__step numeric-input__step--down"><svg viewBox="0 0 12 12"><path d="m2.2 4.4 3.8 3.8 3.8-3.8" /></svg></span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { calculateGeneratorNumericScrubValue, normalizeGeneratorLongValue } from '../modules/generator/parameter-values.js';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  step: { type: [String, Number], default: 0.01 },
  min: { type: [String, Number], default: undefined },
  max: { type: [String, Number], default: undefined },
  integer: { type: Boolean, default: false },
  long: { type: Boolean, default: false },
  scrub: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  ariaLabel: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue', 'commit']);
const inputRef = ref(null);
const draftValue = ref(String(props.modelValue ?? ''));
const editing = ref(false);
const lastCommitted = ref(String(props.modelValue ?? ''));
let scrubState = null;

const inputType = computed(() => props.long ? 'text' : 'number');
const canStep = computed(() => props.scrub && !props.disabled && isNumericDraft(draftValue.value));

watch(() => props.modelValue, (value) => {
  if (!editing.value) {
    draftValue.value = String(value ?? '');
    lastCommitted.value = draftValue.value;
  }
});

function handleInput(event) {
  editing.value = true;
  draftValue.value = event.target.value;
  emit('update:modelValue', draftValue.value);
}

function normalizedValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;
  if (props.long) return normalizeGeneratorLongValue(text);
  if (props.integer) return Math.trunc(numeric);
  return numeric;
}

function isNumericDraft(value) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value ?? '').trim());
}

function scrubStep() {
  const numericStep = Math.abs(Number(props.step));
  if (props.integer) return Math.max(Number.isFinite(numericStep) && numericStep > 0 ? numericStep : 1, 1);
  return Number.isFinite(numericStep) && numericStep > 0 ? numericStep : 0.01;
}

function commit() {
  const next = normalizedValue(draftValue.value);
  const serialized = String(next ?? '');
  if (!editing.value && serialized === lastCommitted.value) return;
  editing.value = false;
  draftValue.value = serialized;
  lastCommitted.value = serialized;
  emit('update:modelValue', next);
  emit('commit', next);
}

function stepValue(direction) {
  if (props.disabled || !canStep.value) return;
  const next = calculateGeneratorNumericScrubValue(Number(draftValue.value), direction, {
    step: scrubStep(),
    min: props.min,
    max: props.max
  });
  const value = normalizedValue(next);
  draftValue.value = String(value);
  editing.value = false;
  lastCommitted.value = draftValue.value;
  emit('update:modelValue', value);
  emit('commit', value);
}

function startStepperScrub(event) {
  if (event.button !== 0 || !canStep.value) return;
  event.preventDefault();
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  scrubState = {
    startY: event.clientY,
    startValue: Number(draftValue.value),
    active: false
  };
  window.addEventListener('pointermove', moveScrub);
  window.addEventListener('pointerup', finishScrub, { once: true });
  window.addEventListener('pointercancel', finishScrub, { once: true });
}

function moveScrub(event) {
  if (!scrubState) return;
  const pixels = scrubState.startY - event.clientY;
  if (!scrubState.active && Math.abs(pixels) < 2) return;
  scrubState.active = true;
  event.preventDefault();
  const scale = event.shiftKey ? 0.1 : (event.ctrlKey || event.metaKey) ? 10 : 1;
  const next = calculateGeneratorNumericScrubValue(scrubState.startValue, pixels, {
    step: scrubStep(),
    min: props.min,
    max: props.max,
    scale
  });
  const value = normalizedValue(next);
  draftValue.value = String(value);
  editing.value = false;
  emit('update:modelValue', value);
}

function finishScrub(event) {
  if (!scrubState) return;
  const active = scrubState.active;
  scrubState = null;
  window.removeEventListener('pointermove', moveScrub);
  window.removeEventListener('pointerup', finishScrub);
  window.removeEventListener('pointercancel', finishScrub);
  if (active) {
    event?.preventDefault?.();
    commit();
  }
}

function cancelScrub() {
  if (!scrubState) return;
  scrubState = null;
  window.removeEventListener('pointermove', moveScrub);
  window.removeEventListener('pointerup', finishScrub);
  window.removeEventListener('pointercancel', finishScrub);
}

function handleKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commit();
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    if (!canStep.value) return;
    event.preventDefault();
    stepValue(event.key === 'ArrowUp' ? 1 : -1);
  }
}

onBeforeUnmount(() => {
  cancelScrub();
});

</script>

<style scoped>
.numeric-input {
  position: relative;
  display: flex;
  min-width: 0;
  width: 100%;
}

.numeric-input__field {
  width: 100%;
  min-width: 0;
  padding-right: 27px;
  appearance: textfield;
}

.numeric-input__field::-webkit-inner-spin-button,
.numeric-input__field::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.numeric-input__stepper {
  position: absolute;
  top: 1px;
  right: 1px;
  bottom: 1px;
  display: grid;
  grid-template-rows: 1fr 1fr;
  width: 24px;
  overflow: hidden;
  border-left: 1px solid var(--line, rgba(255, 255, 255, 0.1));
  border-radius: 0 var(--radius3, 10px) var(--radius3, 10px) 0;
  color: var(--muted, #808b99);
  cursor: ns-resize;
  touch-action: none;
}

.numeric-input__step {
  display: grid;
  place-items: center;
  min-height: 0;
  background: color-mix(in srgb, var(--card2, #181f26) 82%, transparent);
  transition: background var(--speed, 140ms) ease, color var(--speed, 140ms) ease;
}

.numeric-input__step + .numeric-input__step {
  border-top: 1px solid var(--line, rgba(255, 255, 255, 0.08));
}

.numeric-input__stepper:hover:not(.numeric-input__stepper--disabled) {
  color: var(--text, #ecf0f5);
}

.numeric-input__stepper:hover:not(.numeric-input__stepper--disabled) .numeric-input__step {
  background: color-mix(in srgb, var(--accent, #8fa7b8) 14%, var(--card2, #181f26));
}

.numeric-input__stepper--disabled {
  cursor: default;
  opacity: 0.4;
}

.numeric-input__step svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
