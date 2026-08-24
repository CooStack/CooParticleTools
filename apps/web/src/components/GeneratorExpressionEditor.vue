<template>
  <div class="generator-expression-editor">
    <textarea
      :id="editorId"
      ref="textareaRef"
      class="input code-textarea"
      :value="modelValue"
      :placeholder="placeholder"
      role="combobox"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      :aria-controls="completionListboxId"
      :aria-expanded="completionOpen ? 'true' : 'false'"
      :aria-activedescendant="activeDescendantId || undefined"
      :aria-invalid="showValidation ? 'true' : 'false'"
      :aria-describedby="showValidation ? validationMessageId : undefined"
      spellcheck="false"
      wrap="off"
      @blur="closeLater"
      @input="updateValue"
      @keydown="handleKeydown"
      @keyup="handleCaretKeyup"
      @click="refreshCompletionContext"
      @scroll="handleScroll"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
    ></textarea>
    <Teleport to="body">
      <div
        v-if="completionOpen"
        :id="completionListboxId"
        ref="completionRef"
        class="expression-completions"
        :style="completionStyle"
        role="listbox"
        aria-label="代码补全"
      >
        <button
          v-for="(item, index) in visibleCompletions"
          :id="completionOptionId(index)"
          :key="`${item.label}_${index}`"
          type="button"
          class="expression-completion"
          :class="{ active: index === activeIndex }"
          role="option"
          tabindex="-1"
          :aria-selected="index === activeIndex ? 'true' : 'false'"
          @mouseenter="activeIndex = index"
          @mousedown.prevent="insertCompletion(item)"
        >
          <span>{{ item.label }}</span>
          <small>{{ item.detail }}</small>
        </button>
      </div>
    </Teleport>
    <div
      v-if="showValidation"
      :id="validationMessageId"
      class="expression-error"
      role="alert"
    >{{ validationMessage }}</div>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId
} from 'vue';
import {
  applyGeneratorExpressionCompletion,
  filterGeneratorExpressionCompletions
} from '../modules/generator/expression-runtime.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  completions: { type: Array, default: () => [] },
  validationMessage: { type: String, default: '' },
  placeholder: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);
const instanceId = useId();
const editorId = `${instanceId}-expression-editor`;
const completionListboxId = `${instanceId}-expression-completions`;
const validationMessageId = `${instanceId}-expression-error`;
const textareaRef = ref(null);
const completionRef = ref(null);
const open = ref(false);
const activeIndex = ref(0);
const query = ref('');
const forcedOpen = ref(false);
const isComposing = ref(false);
const completionPosition = ref({ top: 36, left: 8, width: 360, maxHeight: 322 });
const completionTheme = ref({});
let blurTimer = 0;
let resizeObserver = null;

const visibleCompletions = computed(() => {
  return filterGeneratorExpressionCompletions(props.completions, query.value, 8);
});

const completionOpen = computed(() => open.value && visibleCompletions.value.length > 0);
const showValidation = computed(() => Boolean(props.validationMessage) && !completionOpen.value);
const activeDescendantId = computed(() => {
  if (!completionOpen.value || activeIndex.value >= visibleCompletions.value.length) return '';
  return completionOptionId(activeIndex.value);
});

const completionStyle = computed(() => ({
  top: `${completionPosition.value.top}px`,
  left: `${completionPosition.value.left}px`,
  width: `${completionPosition.value.width}px`,
  maxHeight: `${completionPosition.value.maxHeight}px`,
  ...completionTheme.value
}));

function completionOptionId(index) {
  return `${instanceId}-expression-completion-${index}`;
}

function currentToken(value = textareaRef.value?.value ?? props.modelValue) {
  const textarea = textareaRef.value;
  if (!textarea) return '';
  const before = String(value || '').slice(0, textarea.selectionStart ?? 0);
  return before.match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || '';
}

function updateValue(event) {
  const value = event.target.value;
  emit('update:modelValue', value);
  if (isComposing.value || event.isComposing) {
    closeCompletions();
    return;
  }
  setCompletionContext(value);
}

function setCompletionContext(value, force = false) {
  query.value = currentToken(value);
  forcedOpen.value = force;
  open.value = force || Boolean(query.value);
  activeIndex.value = 0;
  scheduleCompletionPosition();
}

function refreshCompletionContext() {
  if (isComposing.value) return;
  setCompletionContext(textareaRef.value?.value || '');
}

function handleCompositionStart() {
  isComposing.value = true;
  closeCompletions();
}

function handleCompositionEnd(event) {
  isComposing.value = false;
  setCompletionContext(event.target.value);
}

function handleKeydown(event) {
  if (isComposing.value || event.isComposing || event.keyCode === 229) return;
  if (event.ctrlKey && event.code === 'Space') {
    event.preventDefault();
    setCompletionContext(textareaRef.value?.value || '', true);
    return;
  }
  if (event.key === 'Escape') {
    closeCompletions();
    return;
  }
  if (!completionOpen.value) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % visibleCompletions.value.length;
    scrollActiveOptionIntoView();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + visibleCompletions.value.length) % visibleCompletions.value.length;
    scrollActiveOptionIntoView();
  } else if ((event.key === 'Tab' || event.key === 'Enter') && (forcedOpen.value || currentToken())) {
    event.preventDefault();
    insertCompletion(visibleCompletions.value[activeIndex.value]);
  }
}

function handleCaretKeyup(event) {
  if (isComposing.value || event.isComposing) return;
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
    refreshCompletionContext();
  }
}

function scrollActiveOptionIntoView() {
  nextTick(() => {
    const activeOption = document.getElementById(completionOptionId(activeIndex.value));
    activeOption?.scrollIntoView({ block: 'nearest' });
  });
}

function closeLater() {
  window.clearTimeout(blurTimer);
  blurTimer = window.setTimeout(closeCompletions, 100);
}

function closeCompletions() {
  open.value = false;
  forcedOpen.value = false;
  query.value = '';
}

function handleScroll() {
  if (completionOpen.value) updateCompletionPosition();
}

function handleViewportChange() {
  if (completionOpen.value) updateCompletionPosition();
}

function scheduleCompletionPosition() {
  if (completionOpen.value) nextTick(updateCompletionPosition);
}

const CARET_MIRROR_PROPERTIES = [
  'direction',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontKerning',
  'fontFeatureSettings',
  'fontVariationSettings',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textAlign',
  'textIndent',
  'textTransform',
  'textRendering',
  'tabSize'
];

function measureTextareaCaret(textarea, style) {
  const textareaRect = textarea.getBoundingClientRect();
  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  for (const property of CARET_MIRROR_PROPERTIES) {
    mirror.style[property] = style[property];
  }
  Object.assign(mirror.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    left: `${textareaRect.left}px`,
    top: `${textareaRect.top}px`,
    width: `${textareaRect.width}px`,
    height: 'auto',
    minHeight: '0',
    maxHeight: 'none',
    overflow: 'visible',
    whiteSpace: textarea.wrap === 'off' ? 'pre' : 'pre-wrap',
    overflowWrap: textarea.wrap === 'off' ? 'normal' : 'break-word'
  });
  mirror.style.borderStyle = 'solid';
  mirror.style.borderColor = 'transparent';
  mirror.append(document.createTextNode(textarea.value.slice(0, textarea.selectionStart ?? 0)));
  Object.assign(marker.style, {
    display: 'inline-block',
    width: '0',
    margin: '0',
    padding: '0'
  });
  marker.textContent = '\u200b';
  mirror.append(marker);
  document.body.append(mirror);

  const markerRect = marker.getBoundingClientRect();
  const lineHeight = Number.parseFloat(style.lineHeight)
    || markerRect.height
    || Number.parseFloat(style.fontSize)
    || 16;
  const caret = {
    left: markerRect.left - textarea.scrollLeft,
    top: markerRect.top - textarea.scrollTop,
    bottom: markerRect.top + lineHeight - textarea.scrollTop
  };
  mirror.remove();
  return caret;
}

function syncCompletionTheme(style) {
  const customProperty = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  completionTheme.value = {
    '--completion-border': customProperty('--border', 'rgba(255, 255, 255, 0.14)'),
    '--completion-background': customProperty('--bg-panel-strong', '#12171d'),
    '--completion-text': customProperty('--generator-text', '#ecf0f5'),
    '--completion-muted': customProperty('--text-soft', 'rgba(152, 166, 181, 0.68)'),
    '--completion-brand': customProperty('--brand', '#8fa7b8'),
    colorScheme: style.colorScheme
  };
}

function updateCompletionPosition() {
  const textarea = textareaRef.value;
  if (!textarea || !completionOpen.value) return;
  const style = window.getComputedStyle(textarea);
  const caret = measureTextareaCaret(textarea, style);
  syncCompletionTheme(style);

  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const viewportMargin = 8;
  const popupGap = 4;
  const availableWidth = Math.max(0, viewportWidth - viewportMargin * 2);
  const preferredWidth = Math.min(480, Math.max(360, textarea.getBoundingClientRect().width));
  const popupWidth = Math.min(preferredWidth, availableWidth);
  const desiredHeight = visibleCompletions.value.length * 40 + 2;
  const availableBelow = Math.max(0, viewportHeight - caret.bottom - popupGap - viewportMargin);
  const availableAbove = Math.max(0, caret.top - popupGap - viewportMargin);
  const placeBelow = availableBelow >= Math.min(desiredHeight, 80) || availableBelow >= availableAbove;
  const availableHeight = placeBelow ? availableBelow : availableAbove;
  const popupHeight = Math.max(40, Math.min(desiredHeight, availableHeight));
  const maxLeft = Math.max(viewportMargin, viewportWidth - popupWidth - viewportMargin);
  const left = Math.max(viewportMargin, Math.min(caret.left, maxLeft));
  const top = placeBelow
    ? caret.bottom + popupGap
    : Math.max(viewportMargin, caret.top - popupGap - popupHeight);

  completionPosition.value = {
    left,
    top,
    width: popupWidth,
    maxHeight: popupHeight
  };
}

function extendCompletionSelectionEnd(value, selectionEnd) {
  let end = Math.max(0, Math.min(Number(selectionEnd) || 0, value.length));
  while (end < value.length && /[A-Za-z0-9_]/.test(value[end])) end += 1;
  return end;
}

function insertCompletion(item) {
  const textarea = textareaRef.value;
  if (!textarea || !item) return;
  const selectionEnd = extendCompletionSelectionEnd(textarea.value, textarea.selectionEnd);
  const result = applyGeneratorExpressionCompletion(
    textarea.value,
    textarea.selectionStart,
    selectionEnd,
    item
  );
  emit('update:modelValue', result.value);
  closeCompletions();
  nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
  });
}

onMounted(() => {
  window.addEventListener('resize', handleViewportChange, { passive: true });
  window.addEventListener('scroll', handleViewportChange, true);
  if (typeof ResizeObserver !== 'undefined' && textareaRef.value) {
    resizeObserver = new ResizeObserver(handleViewportChange);
    resizeObserver.observe(textareaRef.value);
  }
});

onBeforeUnmount(() => {
  window.clearTimeout(blurTimer);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.generator-expression-editor {
  position: relative;
  display: grid;
  gap: 6px;
}

.generator-expression-editor .code-textarea {
  height: 180px !important;
  min-height: 180px !important;
  padding: 9px 10px;
  overflow: auto;
  white-space: pre;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  line-height: 1.45;
  tab-size: 4;
}

.expression-completions {
  position: fixed;
  z-index: 1000;
  width: min(480px, calc(100vw - 16px));
  min-width: min(360px, calc(100vw - 16px));
  max-width: min(480px, calc(100vw - 16px));
  display: grid;
  grid-auto-flow: row;
  grid-auto-rows: 40px;
  align-content: start;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid var(--completion-border, rgba(255, 255, 255, 0.14));
  border-radius: 3px;
  background: var(--completion-background, #12171d);
  box-shadow: 0 10px 24px rgb(0 0 0 / 38%);
}

.expression-completions .expression-completion.expression-completion {
  width: 100%;
  height: 40px !important;
  min-height: 40px !important;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
  align-items: center;
  gap: 10px;
  padding: 5px 10px !important;
  border: 0 !important;
  border-bottom: 1px solid var(--completion-border, rgba(255, 255, 255, 0.14)) !important;
  border-radius: 0 !important;
  color: var(--completion-text, #ecf0f5) !important;
  background: var(--completion-background, #12171d) !important;
  box-shadow: none !important;
  transform: none !important;
  filter: none !important;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  text-align: left;
}

.expression-completions .expression-completion.expression-completion:last-child {
  border-bottom: 0 !important;
}

.expression-completions .expression-completion.expression-completion:hover,
.expression-completions .expression-completion.expression-completion.active {
  background: color-mix(
    in srgb,
    var(--completion-brand, #8fa7b8) 20%,
    var(--completion-background, #12171d)
  ) !important;
  box-shadow: none !important;
  transform: none !important;
}

.expression-completions .expression-completion > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expression-completions .expression-completion small {
  min-width: 0;
  max-width: 156px;
  overflow: hidden;
  color: var(--completion-muted, rgba(152, 166, 181, 0.68));
  font-family: inherit;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expression-error {
  color: color-mix(in srgb, var(--danger, #c96f62) 78%, white 22%);
  font-size: 12px;
}
</style>
