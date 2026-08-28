<template>
  <AppShell>
    <RouterView />
    <AppPreferencesModal
      :open="preferencesOpen"
      :current-backup-enabled="currentBackupEnabled"
      :auto-save-intervals="autoSaveIntervals"
      @close="preferencesOpen = false"
      @update-current-backup="setCurrentBackupEnabled"
      @update-auto-save-interval="updateAutoSaveInterval"
      @normalize-auto-save-intervals="normalizeAndWriteAutoSaveIntervals"
      @add-auto-save-interval="addAutoSaveInterval"
      @remove-auto-save-interval="removeAutoSaveInterval"
    />
  </AppShell>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterView } from 'vue-router';
import AppShell from './components/AppShell.vue';
import AppPreferencesModal from './components/AppPreferencesModal.vue';
import {
  hydrateCurrentBackupEnabled,
  hydrateAutoSaveIntervals,
  normalizeAutoSaveIntervals,
  readAutoSaveIntervals,
  readCurrentBackupEnabled,
  watchAutoSaveIntervals,
  watchCurrentBackupEnabled,
  writeAutoSaveIntervals,
  writeCurrentBackupEnabled
} from './modules/preferences/auto-save.js';

const preferencesOpen = ref(false);
const currentBackupEnabled = ref(readCurrentBackupEnabled());
const autoSaveIntervals = ref(readAutoSaveIntervals());
let disposeBackupPreferenceWatch = () => {};
let disposeAutoSaveIntervalsWatch = () => {};

function setCurrentBackupEnabled(value) {
  currentBackupEnabled.value = writeCurrentBackupEnabled(value);
}

function normalizeAndWriteAutoSaveIntervals() {
  autoSaveIntervals.value = writeAutoSaveIntervals(autoSaveIntervals.value);
}

function updateAutoSaveInterval(index, value) {
  if (index < 0 || index >= autoSaveIntervals.value.length) return;
  autoSaveIntervals.value[index] = value;
}

function addAutoSaveInterval() {
  const intervals = normalizeAutoSaveIntervals(autoSaveIntervals.value);
  if (intervals.length >= 32) return;
  const last = Number(intervals[intervals.length - 1] || 1);
  autoSaveIntervals.value = writeAutoSaveIntervals([
    ...intervals,
    Math.min(10080, Math.max(1, Math.round(last * 2)))
  ]);
}

function removeAutoSaveInterval(index) {
  const intervals = autoSaveIntervals.value.slice();
  if (intervals.length <= 1 || index < 0 || index >= intervals.length) return;
  intervals.splice(index, 1);
  autoSaveIntervals.value = writeAutoSaveIntervals(intervals);
}

function handleShellCommand(event) {
  if (event?.detail?.type !== 'open-preferences') return;
  event.preventDefault();
  preferencesOpen.value = true;
}

onMounted(async () => {
  window.addEventListener('coo-shell-command', handleShellCommand);
  disposeBackupPreferenceWatch = watchCurrentBackupEnabled((value) => {
    currentBackupEnabled.value = value;
  });
  disposeAutoSaveIntervalsWatch = watchAutoSaveIntervals((value) => {
    autoSaveIntervals.value = value;
  });
  currentBackupEnabled.value = await hydrateCurrentBackupEnabled();
  autoSaveIntervals.value = await hydrateAutoSaveIntervals();
});

onBeforeUnmount(() => {
  window.removeEventListener('coo-shell-command', handleShellCommand);
  disposeBackupPreferenceWatch();
  disposeAutoSaveIntervalsWatch();
});
</script>
