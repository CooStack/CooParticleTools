<template>
  <section class="panel code-panel">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ eyebrow }}</div>
        <h3>{{ title }}</h3>
      </div>
      <button class="btn secondary" type="button" @click="copyText">复制</button>
    </div>
    <pre>{{ code }}</pre>
  </section>
</template>

<script setup>
async function copy(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

const props = defineProps({
  eyebrow: { type: String, default: '代码输出' },
  title: { type: String, default: 'Kotlin' },
  code: { type: String, default: '' }
});

async function copyText() {
  await copy(props.code || '');
}
</script>
