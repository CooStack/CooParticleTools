<template>
  <div class="app-shell" :class="shellClasses">
    <main class="app-shell-main" :class="mainClasses">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const embedded = computed(() => String(route.query.embedded || '') === '1');
const fullBleed = computed(() => route.meta?.fullBleed === true);
const routeClass = computed(() => {
  const name = String(route.name || 'unknown').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `app-shell--route-${name}`;
});
const generatorThemeRoutes = new Set([
  'workbench',
  'plugins',
  'pointsbuilder',
  'composition',
  'composition-pointsbuilder',
  'shader-builder',
  'generator',
  'generator-pointsbuilder',
  'bezier'
]);
const minecraftRoutes = new Set([
  'pointsbuilder',
  'composition',
  'composition-pointsbuilder',
  'shader-builder',
  'generator',
  'generator-pointsbuilder',
  'bezier'
]);
const generatorTheme = computed(() => generatorThemeRoutes.has(String(route.name || '')));
const minecraftShell = computed(() => minecraftRoutes.has(String(route.name || '')));

const shellClasses = computed(() => ({
  'app-shell--embedded': embedded.value,
  'app-shell--fullbleed': fullBleed.value,
  'app-shell--minecraft': minecraftShell.value,
  'app-shell--generator-theme': generatorTheme.value,
  [routeClass.value]: true
}));

const mainClasses = computed(() => ({
  'app-shell-main--embedded': embedded.value,
  'app-shell-main--fullbleed': fullBleed.value,
  'app-shell-main--minecraft': minecraftShell.value,
  'app-shell-main--generator-theme': generatorTheme.value,
  [routeClass.value.replace('app-shell--', 'app-shell-main--')]: true
}));
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-shell-main {
  min-height: 100vh;
}

.app-shell--fullbleed {
  padding: 0;
}

.app-shell-main--fullbleed {
  min-height: 100vh;
}

.app-shell--embedded,
.app-shell-main--embedded {
  min-height: 100%;
}
</style>
