<template>
  <section class="collapsible-card" :class="{ 'collapsible-card--closed': !isOpen }">
    <header class="collapsible-card__header">
      <button
        class="collapsible-card__toggle"
        type="button"
        :aria-expanded="String(isOpen)"
        :aria-controls="bodyId"
        @click="toggle"
      >
        <svg class="collapsible-card__chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        <span class="collapsible-card__title"><slot name="title">{{ title }}</slot></span>
      </button>
      <div v-if="$slots.actions" class="collapsible-card__actions" @click.stop>
        <slot name="actions" />
      </div>
    </header>
    <Transition
      @before-enter="beforeEnter"
      @enter="enter"
      @after-enter="afterEnter"
      @before-leave="beforeLeave"
      @leave="leave"
      @after-leave="afterLeave"
    >
      <div v-show="isOpen" :id="bodyId" ref="bodyRef" class="collapsible-card__body">
        <div class="collapsible-card__body-inner"><slot /></div>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  modelValue: { type: Boolean, default: undefined }
});
const emit = defineEmits(['update:modelValue', 'change']);
const bodyRef = ref(null);
const openState = ref(props.modelValue === undefined ? true : props.modelValue);
const isOpen = computed(() => props.modelValue === undefined ? openState.value : props.modelValue);
const bodyId = `collapsible-card-${Math.random().toString(36).slice(2, 10)}`;
let animationFrame = 0;
let transitionToken = 0;
const transitionState = new WeakMap();

watch(() => props.modelValue, (value) => {
  if (value !== undefined) openState.value = value;
});

function cancelAnimationFrameIfNeeded() {
  if (!animationFrame) return;
  window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
}

function toggle() {
  const next = !isOpen.value;
  if (props.modelValue === undefined) openState.value = next;
  emit('update:modelValue', next);
  emit('change', next);
}

function beginTransition(element, phase) {
  const token = ++transitionToken;
  transitionState.set(element, { token, phase });
  return token;
}

function isCurrentTransition(element, token, phase) {
  const state = transitionState.get(element);
  return Boolean(state && state.token === token && state.phase === phase);
}

function beforeEnter(element) {
  cancelAnimationFrameIfNeeded();
  beginTransition(element, 'enter');
  element.style.height = '0px';
  element.style.opacity = '0';
}

function enter(element) {
  cancelAnimationFrameIfNeeded();
  const token = transitionState.get(element)?.token;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = 0;
    if (!isCurrentTransition(element, token, 'enter')) return;
    element.style.height = `${element.scrollHeight}px`;
    element.style.opacity = '1';
  });
}

function afterEnter(element) {
  if (transitionState.get(element)?.phase !== 'enter') return;
  element.style.height = 'auto';
  element.style.opacity = '';
}

function beforeLeave(element) {
  cancelAnimationFrameIfNeeded();
  beginTransition(element, 'leave');
  element.style.height = `${element.scrollHeight}px`;
  element.style.opacity = '1';
}

function leave(element) {
  cancelAnimationFrameIfNeeded();
  const token = transitionState.get(element)?.token;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = 0;
    if (!isCurrentTransition(element, token, 'leave')) return;
    element.style.height = '0px';
    element.style.opacity = '0';
  });
}

function afterLeave(element) {
  if (transitionState.get(element)?.phase !== 'leave') return;
  element.style.height = '';
  element.style.opacity = '';
}

onBeforeUnmount(() => {
  cancelAnimationFrameIfNeeded();
  transitionToken += 1;
});
</script>

<style scoped>
.collapsible-card {
  display: grid;
  min-width: 0;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius2, 12px);
  background: color-mix(in srgb, var(--card, #1d242b) 94%, var(--accent, #8fa7b8) 6%);
  box-shadow: var(--elev-1, 0 1px 2px rgb(0 0 0 / 24%));
  overflow: hidden;
}

.collapsible-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.08));
}

.collapsible-card--closed .collapsible-card__header {
  border-bottom-color: transparent;
}

.collapsible-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--text, #ecf0f5);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.collapsible-card__toggle:focus-visible {
  outline: none;
  border-radius: var(--radius3, 10px);
  box-shadow: var(--focus-ring, 0 0 0 3px rgb(143 167 184 / 22%));
}

.collapsible-card__chevron {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--speed, 140ms) ease;
}

.collapsible-card--closed .collapsible-card__chevron {
  transform: rotate(-90deg);
}

.collapsible-card__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collapsible-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.collapsible-card__body {
  min-width: 0;
  overflow: hidden;
  transition: height 180ms ease, opacity 180ms ease;
}

.collapsible-card__body-inner {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .collapsible-card__chevron,
  .collapsible-card__body {
    transition: none;
  }
}
</style>
