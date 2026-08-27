<template>
  <div class="cparticle-mask-editor">
    <div class="panel-title-row">
      <div>
        <strong>CParticle 标记与掩码</strong>
      </div>
    </div>

    <div v-if="errors.length" class="compatibility-note compatibility-note--error">
      <strong>配置错误</strong>
      <ul><li v-for="message in errors" :key="message">{{ message }}</li></ul>
    </div>

    <section class="editor-section">
      <div class="panel-title-row compact">
        <span class="section-title">sign 逻辑标签</span>
      </div>
      <div v-if="!project.signs.length" class="empty-state">暂无命名 sign。</div>
      <article v-for="sign in project.signs" :key="sign.id" class="definition-row">
        <label class="field"><span>名称</span><input v-model="sign.name" class="input" type="text" placeholder="smoke" /></label>
        <label class="field"><span>Int 值</span><input v-model.number="sign.value" class="input" type="number" step="1" /></label>
        <button class="btn small danger" @click="removeSign(sign.id)">删除</button>
      </article>
    </section>

    <section class="editor-section">
      <div class="panel-title-row compact">
        <span class="section-title">commandMask 类别</span>
      </div>
      <div v-if="!project.commandMasks.length" class="empty-state">暂无命名 commandMask。</div>
      <article v-for="mask in project.commandMasks" :key="mask.id" class="definition-row">
        <label class="field"><span>名称</span><input v-model="mask.name" class="input" type="text" placeholder="wind" /></label>
        <label class="field"><span>Int 掩码</span><input v-model.number="mask.value" class="input" type="number" step="1" /></label>
        <button class="btn small danger" @click="removeCommandMask(mask.id)">删除</button>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { collectCParticleForceErrors } from '../modules/generator/defaults.js';

const props = defineProps({
  project: { type: Object, required: true }
});

const errors = computed(() => collectCParticleForceErrors(props.project).filter((message) => (
  message.startsWith('sign 标签')
  || message.startsWith('commandMask')
  || (/^发射器/.test(message) && /sign 标签|commandMask/.test(message))
)));

function removeSign(id) {
  const index = props.project.signs.findIndex((item) => item.id === id);
  if (index >= 0) props.project.signs.splice(index, 1);
  props.project.emitters.forEach((card) => {
    if (card.gpu?.signRef === id) card.gpu.signRef = '';
  });
  props.project.forceCommands.forEach((command) => {
    if (command.selector?.signRef === id) command.selector.signRef = '';
  });
}

function removeCommandMask(id) {
  const index = props.project.commandMasks.findIndex((item) => item.id === id);
  if (index >= 0) props.project.commandMasks.splice(index, 1);
  props.project.emitters.forEach((card) => {
    if (card.gpu) card.gpu.commandMaskRefs = card.gpu.commandMaskRefs.filter((ref) => ref !== id);
  });
  props.project.forceCommands.forEach((command) => {
    command.selector.commandMaskRefs = command.selector.commandMaskRefs.filter((ref) => ref !== id);
  });
}
</script>

<style scoped>
.cparticle-mask-editor {
  display: grid;
  gap: 16px;
}

.editor-section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius2, 12px);
  background: var(--bg-soft);
}

.definition-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 0.55fr) auto;
  gap: 10px;
  align-items: end;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius3, 10px);
  background: color-mix(in srgb, var(--bg-panel-strong) 76%, transparent);
}

.compatibility-note ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.compatibility-note {
  border-radius: var(--radius3, 10px);
}

@media (max-width: 900px) {
  .definition-row {
    grid-template-columns: 1fr;
  }
}
</style>
