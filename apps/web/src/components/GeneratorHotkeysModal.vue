<template>
  <div v-if="open" class="gen-hk-mask" @click.self="$emit('close')">
    <section
      ref="modalRef"
      class="gen-hk-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generator-hotkeys-title"
      tabindex="-1"
    >
      <header class="gen-hk-head">
        <h2 id="generator-hotkeys-title">快捷键设置</h2>
        <input v-model="keyword" class="input gen-hk-search" type="search" placeholder="搜索快捷键" />
        <button class="gen-hk-close" type="button" aria-label="关闭" @click="$emit('close')">X</button>
      </header>

      <div class="gen-hk-body">
        <p class="gen-hk-hint">{{ hint }}</p>

        <div class="gen-hk-list">
          <section class="gen-hk-section">
            <div class="gen-hk-section-title">动作快捷键</div>

            <div v-if="!filteredDefs.length" class="gen-hk-empty">没有匹配的快捷键。</div>

            <div
              v-for="item in filteredDefs"
              :key="item.key"
              class="gen-hk-row"
              :class="{ capturing: item.key === capturingKey }"
            >
              <div class="gen-hk-name">
                <div class="gen-hk-title">{{ item.label }}</div>
                <div class="gen-hk-desc">{{ item.desc }}</div>
              </div>
              <div class="gen-hk-key" :class="{ empty: !bindingOf(item.key) }">
                {{ formatHotkey(bindingOf(item.key)) || '未设置' }}
              </div>
              <div class="gen-hk-actions">
                <button class="gen-hk-btn primary" type="button" @click="$emit('start-capture', item.key)">设置</button>
                <button class="gen-hk-btn" type="button" @click="$emit('clear-hotkey', item.key)">清空</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer class="gen-hk-foot">
        <button class="gen-hk-btn" type="button" @click="$emit('reset-hotkeys')">恢复默认</button>
        <span class="gen-hk-spacer"></span>
        <button class="gen-hk-btn primary" type="button" @click="$emit('close')">关闭</button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { hotkeyToHuman } from '../modules/pointsbuilder/hotkeys.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  hotkeys: { type: Object, default: () => ({}) },
  hotkeyDefs: { type: Array, default: () => [] },
  capturingKey: { type: String, default: '' },
  hint: { type: String, default: '点击“设置”后按下按键（Esc 取消，Backspace 清空）。' }
});

defineEmits(['close', 'start-capture', 'clear-hotkey', 'reset-hotkeys']);

const modalRef = ref(null);
const keyword = ref('');
let returnFocusElement = null;

const filteredDefs = computed(() => {
  const normalized = String(keyword.value || '').trim().toLowerCase();
  if (!normalized) return props.hotkeyDefs;
  return props.hotkeyDefs.filter((item) => {
    const haystack = `${item.label} ${item.desc} ${hotkeyToHuman(bindingOf(item.key))}`.toLowerCase();
    return haystack.includes(normalized);
  });
});

function bindingOf(key) {
  return props.hotkeys?.[key] || '';
}

function formatHotkey(value) {
  return hotkeyToHuman(value);
}

watch(() => props.open, async (open) => {
  if (open) {
    keyword.value = '';
    returnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    modalRef.value?.querySelector('.gen-hk-search')?.focus();
  } else if (returnFocusElement?.isConnected) {
    await nextTick();
    returnFocusElement.focus();
    returnFocusElement = null;
  }
});
</script>

<style scoped>
.gen-hk-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--scrim, rgb(2 5 13 / 58%));
  backdrop-filter: blur(3px);
}

.gen-hk-modal {
  width: min(960px, 100%);
  max-height: min(880px, calc(100vh - 40px));
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border: 1px solid var(--line2, rgba(255, 255, 255, 0.14));
  border-radius: var(--radius, 14px);
  background: var(--panel, #171d23);
  color: var(--text, #ecf0f5);
  box-shadow: var(--shadow, 0 12px 30px rgba(0, 0, 0, 0.35));
}

.gen-hk-head {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.08));
}

.gen-hk-head h2 {
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
}

.gen-hk-search {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 360px;
  margin: 0 auto;
}

.gen-hk-close {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius2, 10px);
  color: inherit;
  background: var(--card, #1d242b);
  line-height: 1;
}

.gen-hk-body {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 14px;
}

.gen-hk-hint {
  margin: 0;
  color: var(--muted, rgba(152, 166, 181, 0.68));
  font-family: var(--font-mono);
  font-size: 12px;
}

.gen-hk-list {
  display: grid;
  gap: 10px;
}

.gen-hk-section {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius2, 10px);
  background: color-mix(in srgb, var(--panel2, #12171d) 72%, transparent);
}

.gen-hk-section-title {
  color: var(--muted, rgba(152, 166, 181, 0.68));
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.gen-hk-empty {
  padding: 10px 2px;
  color: var(--muted, rgba(152, 166, 181, 0.68));
  font-size: 12px;
}

.gen-hk-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius3, 8px);
  background: color-mix(in srgb, var(--panel2, #12171d) 55%, transparent);
  transition: border-color 140ms ease, background 140ms ease;
}

.gen-hk-row:hover {
  border-color: var(--line2, rgba(255, 255, 255, 0.14));
}

.gen-hk-row.capturing {
  border-color: color-mix(in srgb, var(--accent, #8fa7b8) 70%, transparent);
  box-shadow: inset 2px 0 0 var(--accent, #8fa7b8);
}

.gen-hk-name {
  flex: 1 1 280px;
  min-width: 0;
}

.gen-hk-title {
  font-weight: 600;
}

.gen-hk-desc {
  margin-top: 2px;
  color: var(--muted, rgba(152, 166, 181, 0.68));
  font-family: var(--font-mono);
  font-size: 11px;
}

.gen-hk-key {
  flex: 0 0 auto;
  min-width: 124px;
  padding: 5px 10px;
  border: 1px solid var(--line2, rgba(255, 255, 255, 0.14));
  border-radius: 999px;
  background: var(--card2, #181f26);
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: center;
}

.gen-hk-key.empty {
  color: var(--muted2, rgba(152, 166, 181, 0.44));
}

.gen-hk-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.gen-hk-btn {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius2, 10px);
  color: var(--text, #ecf0f5);
  background: var(--card, #1d242b);
  font-size: 12px;
  transition: border-color 140ms ease, background 140ms ease;
}

.gen-hk-btn:hover {
  border-color: var(--line2, rgba(255, 255, 255, 0.14));
  background: color-mix(in srgb, var(--card, #1d242b) 88%, var(--hover-veil, rgba(255, 255, 255, 0.04)));
}

.gen-hk-btn.primary {
  border-color: color-mix(in srgb, var(--accent, #8fa7b8) 52%, transparent);
  background: var(--accent, #8fa7b8);
  color: var(--accent-ink, #171513);
  font-weight: 600;
}

.gen-hk-btn.primary:hover {
  background: color-mix(in srgb, var(--accent, #8fa7b8) 88%, white 12%);
}

.gen-hk-btn:focus-visible,
.gen-hk-close:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--accent, #8fa7b8) 58%, transparent);
  box-shadow: var(--focus-ring, 0 0 0 3px rgba(143, 167, 184, 0.22));
}

.gen-hk-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--line, rgba(255, 255, 255, 0.08));
}

.gen-hk-spacer {
  flex: 1 1 auto;
}

@media (max-width: 680px) {
  .gen-hk-mask { padding: 10px; }

  .gen-hk-head {
    flex-wrap: wrap;
  }

  .gen-hk-search {
    order: 3;
    max-width: none;
    width: 100%;
    margin: 0;
  }

  .gen-hk-head h2 { flex: 1 1 auto; }

  .gen-hk-key { min-width: 96px; }
}
</style>
