<template>
  <AppTitleBar v-if="!embedded" ref="titleBarRef" />
  <div class="app-shell" :class="shellClasses">
    <main class="app-shell-main" :class="mainClasses">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppTitleBar from './AppTitleBar.vue';
import { getElectronShell } from '../services/shell/electron-shell.js';
import { findThemeHost, readChromeColors } from '../utils/window-chrome.js';

const route = useRoute();
const embedded = computed(() => String(route.query.embedded || '') === '1');
const fullBleed = computed(() => route.meta?.fullBleed === true);
const routeClass = computed(() => {
  const name = String(route.name || 'unknown').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `app-shell--route-${name}`;
});
const shellClasses = computed(() => ({
  'app-shell--embedded': embedded.value,
  'app-shell--fullbleed': fullBleed.value,
  [routeClass.value]: true
}));

const mainClasses = computed(() => ({
  'app-shell-main--embedded': embedded.value,
  'app-shell-main--fullbleed': fullBleed.value,
  [routeClass.value.replace('app-shell--', 'app-shell-main--')]: true
}));

const titleBarRef = ref(null);
const shell = getElectronShell();
let themeObserver = null;
let lastPushed = '';

/*
 * Keep the native window-control overlay on the same colours as the page. The
 * page theme can change from three places — the route, a builder's theme select
 * (relayed out of the iframe by LegacyPageFrame), and the generator's own
 * data-theme attribute — so watch the DOM rather than any single source.
 */
async function syncChrome() {
  if (!shell?.setTitleBarTheme) return;
  const colors = readChromeColors(findThemeHost());
  if (!colors) return;
  const signature = `${colors.color}|${colors.symbolColor}`;
  if (signature === lastPushed) return;
  lastPushed = signature;
  try {
    await shell.setTitleBarTheme(colors);
  } catch {
    // Non-Windows platforms have no overlay to theme.
  }
}

function applyChromeHeight() {
  if (typeof document === 'undefined') return;
  // Comes from the title bar's own IPC handshake, so it is 0 until that resolves
  // and then the exact native height -- never a guessed constant.
  const height = titleBarRef.value?.reservedHeight ?? 0;
  document.documentElement.style.setProperty('--app-chrome-h', `${height}px`);
}

onMounted(() => {
  if (typeof MutationObserver === 'function') {
    themeObserver = new MutationObserver(() => void syncChrome());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-generator-theme'],
      subtree: true
    });
  }
});

/*
 * The title bar resolves its visibility and height asynchronously over IPC.
 * Watching it means the reserved space lands the moment that resolves; reading it
 * once at mount (even on a next-tick timeout) raced the handshake and left the
 * first paint sitting underneath the title bar until the next route change.
 */
watch(
  () => titleBarRef.value?.reservedHeight,
  () => {
    applyChromeHeight();
    void syncChrome();
  },
  { immediate: true, flush: 'post' }
);

watch(() => route.fullPath, () => {
  applyChromeHeight();
  window.setTimeout(() => void syncChrome(), 0);
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
});
</script>

<style scoped>
.app-shell {
  min-height: var(--app-vh);
  padding-top: var(--app-chrome-h, 0px);
}

.app-shell-main {
  min-height: var(--app-vh);
}

.app-shell--fullbleed {
  padding: 0;
  padding-top: var(--app-chrome-h, 0px);
}

.app-shell-main--fullbleed {
  min-height: var(--app-vh);
}

.app-shell--embedded,
.app-shell-main--embedded {
  min-height: 100%;
  padding-top: 0;
}
</style>
