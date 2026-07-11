<template>
  <div v-if="open" class="modal-mask" @click="$emit('close')"></div>
  <div v-if="open" class="modal" role="dialog" aria-modal="true">
    <div class="modal-head">
      <div class="modal-title">快捷键设置</div>
      <input v-model="keyword" class="input" placeholder="搜索快捷键" />
      <button class="btn icon" @click="$emit('close')">X</button>
    </div>
    <div class="modal-body">
      <div class="hint-line">{{ hint }}</div>
      <div class="hk-list">
        <article v-for="item in filteredDefs" :key="item.id" class="hk-item">
          <div class="card-head">
            <div>
              <strong>{{ item.title }}</strong>
              <div class="muted">{{ item.desc }}</div>
            </div>
            <span class="badge">{{ hotkeyToHuman(hotkeys.actions[item.id]) || '未设置' }}</span>
          </div>
          <div class="card-title-row-actions">
            <button class="btn small" @click="$emit('start-capture', item.id)">设置</button>
            <button class="btn small" @click="$emit('clear-hotkey', item.id)">清空</button>
          </div>
        </article>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" @click="$emit('reset-hotkeys')">恢复默认</button>
      <span class="flex-spacer"></span>
      <button class="btn primary" @click="$emit('close')">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { hotkeyToHuman } from '../modules/composition/hotkeys.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  hotkeys: { type: Object, required: true },
  hotkeyDefs: { type: Array, default: () => [] },
  hint: { type: String, default: '' }
});

defineEmits(['close', 'start-capture', 'clear-hotkey', 'reset-hotkeys']);

const keyword = ref('');
const filteredDefs = computed(() => {
  const normalized = String(keyword.value || '').trim().toLowerCase();
  if (!normalized) return props.hotkeyDefs;
  return props.hotkeyDefs.filter((item) => `${item.title} ${item.desc}`.toLowerCase().includes(normalized));
});
</script>
