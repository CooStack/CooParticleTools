<template>
  <header v-if="visible" class="app-titlebar" :style="barStyle">
    <div class="app-titlebar-drag">
      <span class="app-titlebar-mark" aria-hidden="true">CP</span>
      <span class="app-titlebar-name">{{ appName }}</span>
    </div>

    <nav ref="menuRef" class="app-titlebar-menu" aria-label="应用菜单">
      <div v-for="menu in model" :key="menu.id" class="app-titlebar-menu-slot">
        <button
          type="button"
          class="app-titlebar-menu-button"
          :class="{ open: openMenuId === menu.id }"
          :aria-expanded="openMenuId === menu.id"
          aria-haspopup="menu"
          @click="toggleMenu(menu.id)"
          @mouseenter="hoverMenu(menu.id)"
        >{{ menu.label }}</button>

        <div v-if="openMenuId === menu.id" class="app-titlebar-dropdown" role="menu">
          <template v-for="(item, index) in menu.items" :key="item.id || `sep-${index}`">
            <div v-if="item.type === 'separator'" class="app-titlebar-separator" role="separator"></div>

            <div v-else-if="item.items" class="app-titlebar-submenu-slot">
              <button
                type="button"
                class="app-titlebar-item"
                role="menuitem"
                aria-haspopup="menu"
                :aria-expanded="openSubmenuId === item.id"
                @click.stop="toggleSubmenu(item.id)"
                @mouseenter="openSubmenuId = item.id"
              >
                <span class="app-titlebar-item-label">{{ item.label }}</span>
                <span class="app-titlebar-item-arrow" aria-hidden="true">›</span>
              </button>

              <div v-if="openSubmenuId === item.id" class="app-titlebar-dropdown app-titlebar-dropdown--nested" role="menu">
                <template v-for="(sub, subIndex) in item.items" :key="sub.id || `sub-sep-${subIndex}`">
                  <div v-if="sub.type === 'separator'" class="app-titlebar-separator" role="separator"></div>
                  <button
                    v-else
                    type="button"
                    class="app-titlebar-item"
                    role="menuitem"
                    :disabled="sub.enabled === false"
                    :title="sub.sublabel || ''"
                    @click="invoke(sub)"
                  >
                    <span class="app-titlebar-item-label">{{ sub.label }}</span>
                  </button>
                </template>
              </div>
            </div>

            <button
              v-else
              type="button"
              class="app-titlebar-item"
              role="menuitem"
              :disabled="item.enabled === false"
              @click="invoke(item)"
            >
              <span class="app-titlebar-item-label">{{ item.label }}</span>
              <span v-if="item.accelerator" class="app-titlebar-item-key">{{ formatAccelerator(item.accelerator) }}</span>
            </button>
          </template>
        </div>
      </div>
    </nav>

    <div class="app-titlebar-spacer"></div>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getElectronShell } from '../services/shell/electron-shell.js';

const shell = getElectronShell();
const model = ref([]);
const chrome = ref(null);
const openMenuId = ref('');
const openSubmenuId = ref('');
const menuRef = ref(null);
let disposeMenuModel = null;

const visible = computed(() => Boolean(chrome.value?.customTitleBar && model.value.length));
const barHeight = computed(() => chrome.value?.titleBarHeight || 34);
/*
 * The height the shell must reserve. 0 until the IPC handshake resolves, so the
 * shell can watch this reactively instead of guessing at mount time (guessing is
 * what left the first paint laid out underneath the title bar).
 */
const reservedHeight = computed(() => (visible.value ? barHeight.value : 0));
const appName = computed(() => chrome.value?.appName || 'CooParticlesAPI Tools');
const isMac = computed(() => chrome.value?.platform === 'darwin');
const barStyle = computed(() => ({
  height: `${barHeight.value}px`
}));

function formatAccelerator(raw) {
  const text = String(raw || '');
  if (!text) return '';
  if (isMac.value) {
    return text
      .replace(/CommandOrControl|CmdOrCtrl|Command|Cmd/g, '⌘')
      .replace(/Shift/g, '⇧')
      .replace(/Alt|Option/g, '⌥')
      .replace(/Control|Ctrl/g, '⌃')
      .replace(/\+/g, '');
  }
  return text.replace(/CommandOrControl|CmdOrCtrl|Command|Cmd/g, 'Ctrl');
}

function closeMenus() {
  openMenuId.value = '';
  openSubmenuId.value = '';
}

function toggleMenu(id) {
  openSubmenuId.value = '';
  openMenuId.value = openMenuId.value === id ? '' : id;
}

// Once one menu is open, hovering the siblings switches between them — standard
// menu-bar behaviour.
function hoverMenu(id) {
  if (!openMenuId.value || openMenuId.value === id) return;
  openSubmenuId.value = '';
  openMenuId.value = id;
}

function toggleSubmenu(id) {
  openSubmenuId.value = openSubmenuId.value === id ? '' : id;
}

async function invoke(item) {
  if (!item || item.enabled === false) return;
  closeMenus();
  await shell?.runMenuCommand?.(item.id);
}

function handlePointerDown(event) {
  if (!openMenuId.value) return;
  if (menuRef.value?.contains(event.target)) return;
  closeMenus();
}

function handleKeydown(event) {
  if (event.key === 'Escape' && openMenuId.value) {
    event.preventDefault();
    closeMenus();
  }
}

onMounted(async () => {
  if (!shell?.getWindowChrome) return;
  try {
    chrome.value = await shell.getWindowChrome();
    model.value = (await shell.getMenuModel?.()) || [];
  } catch {
    chrome.value = null;
    return;
  }
  disposeMenuModel = shell.onMenuModel?.((next) => {
    if (Array.isArray(next)) model.value = next;
  }) || null;
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('keydown', handleKeydown, true);
});

onBeforeUnmount(() => {
  disposeMenuModel?.();
  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('keydown', handleKeydown, true);
});

defineExpose({ visible, reservedHeight });
</script>

<style scoped>
.app-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 900;
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  user-select: none;
  /* Sits above the page, so it inherits whatever theme the page is wearing. */
  backdrop-filter: blur(12px);
}

.app-titlebar-drag {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  /* Everything except the buttons is a window drag handle. */
  -webkit-app-region: drag;
  app-region: drag;
}

.app-titlebar-mark {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 16%, var(--card2));
  color: color-mix(in srgb, var(--accent) 84%, white 16%);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
}

.app-titlebar-name {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.app-titlebar-menu {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.app-titlebar-menu-slot,
.app-titlebar-submenu-slot {
  position: relative;
  display: flex;
  align-items: stretch;
}

.app-titlebar-menu-button {
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  color: var(--muted);
  background: transparent;
  font-size: 12px;
  transition: background var(--speed) ease, color var(--speed) ease;
}

.app-titlebar-menu-button:hover,
.app-titlebar-menu-button.open {
  color: var(--text);
  background: var(--hover-veil);
}

.app-titlebar-menu-button.open {
  box-shadow: inset 0 -2px 0 var(--accent);
}

/* The drag region must not swallow the window controls Electron overlays. */
.app-titlebar-spacer {
  flex: 1 1 auto;
  -webkit-app-region: drag;
  app-region: drag;
}

.app-titlebar-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1;
  min-width: 216px;
  padding: 5px;
  display: grid;
  gap: 1px;
  border: 1px solid var(--line2);
  border-radius: var(--radius2);
  background: var(--panel);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.app-titlebar-dropdown--nested {
  top: -5px;
  left: 100%;
  margin-left: 2px;
}

.app-titlebar-item {
  width: 100%;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius3);
  color: var(--text);
  background: transparent;
  font-size: 12px;
  text-align: left;
  transition: background var(--speed) ease;
}

.app-titlebar-item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.app-titlebar-item:disabled {
  color: var(--muted2);
  cursor: default;
}

.app-titlebar-item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-titlebar-item-key {
  flex: 0 0 auto;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.app-titlebar-item-arrow {
  flex: 0 0 auto;
  color: var(--muted);
}

.app-titlebar-separator {
  height: 1px;
  margin: 4px 6px;
  background: var(--line);
}
</style>
