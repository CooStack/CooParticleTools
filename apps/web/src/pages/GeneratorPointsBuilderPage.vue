<template>
  <LegacyPageFrame
    page="pointsbuilder.html"
    title="发射器 PointsBuilder"
    :frame-query="frameQuery"
    :manage-project="false"
    :return-route="backRoute"
    :before-frame-leave="saveBackToGenerator"
  />
</template>

<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import LegacyPageFrame from '../components/LegacyPageFrame.vue';
import { createGeneratorProject, normalizeGeneratorProject } from '../modules/generator/defaults.js';
import {
  createGeneratorPointsBuilderSnapshot,
  createGeneratorPointsBuilderVariableContext,
  GENERATOR_POINTS_BUILDER_CONTEXT_KEY,
  GENERATOR_POINTS_BUILDER_KOTLIN_END_KEY,
  GENERATOR_POINTS_BUILDER_NAME_KEY,
  GENERATOR_POINTS_BUILDER_STATE_KEY,
  GENERATOR_POINTS_BUILDER_VARIABLE_CONTEXT_KEY,
  mergeGeneratorPointsBuilderSnapshot,
  shouldReuseGeneratorPointsBuilderDraft
} from '../modules/generator/pointsbuilder-bridge.js';
import { getProjectRepository } from '../services/repositories/project-repository.js';

const GENERATOR_STORAGE_KEY = 'vue_emitter_generator_state_v2';

const route = useRoute();
const projectRepository = getProjectRepository();
const frameQuery = Object.freeze({ pointsBuilderContext: 'generator' });
const emitterId = computed(() => String(route.query.emitterId || ''));
const projectId = computed(() => String(route.query.projectId || ''));
const backRoute = computed(() => ({
  name: 'generator',
  query: {
    projectId: projectId.value,
    projectType: String(route.query.projectType || 'generator')
  }
}));

function loadGeneratorProject() {
  try {
    const raw = localStorage.getItem(GENERATOR_STORAGE_KEY);
    return normalizeGeneratorProject(raw ? JSON.parse(raw) : createGeneratorProject());
  } catch {
    return createGeneratorProject();
  }
}

function saveGeneratorProject(nextProject) {
  try {
    localStorage.setItem(GENERATOR_STORAGE_KEY, JSON.stringify(nextProject));
  } catch {
    // ignore storage quota errors
  }
}

function findTargetEmitter(project) {
  return emitterId.value
    ? project.emitters.find((card) => card.id === emitterId.value)
    : project.emitters.find((card) => card.id === project.selectedEmitterId) || project.emitters[0];
}

function seedPointsBuilderFrame() {
  const project = loadGeneratorProject();
  const target = findTargetEmitter(project);
  if (!target) return;
  const snapshot = createGeneratorPointsBuilderSnapshot(target.emitter.builderState);
  try {
    localStorage.setItem(
      GENERATOR_POINTS_BUILDER_VARIABLE_CONTEXT_KEY,
      JSON.stringify({
        ...createGeneratorPointsBuilderVariableContext(project.parameters),
        ts: Date.now()
      })
    );
    const storedRaw = localStorage.getItem(GENERATOR_POINTS_BUILDER_STATE_KEY);
    const contextRaw = localStorage.getItem(GENERATOR_POINTS_BUILDER_CONTEXT_KEY);
    const storedState = storedRaw ? JSON.parse(storedRaw) : null;
    const storedContext = contextRaw ? JSON.parse(contextRaw) : null;
    const identity = {
      projectId: projectId.value,
      emitterId: target.id
    };
    if (shouldReuseGeneratorPointsBuilderDraft(storedState, storedContext, identity)) {
      return;
    }
    const seededAt = Date.now();
    localStorage.setItem(
      GENERATOR_POINTS_BUILDER_STATE_KEY,
      JSON.stringify({ state: snapshot.state, ts: seededAt })
    );
    localStorage.setItem(GENERATOR_POINTS_BUILDER_NAME_KEY, snapshot.projectName);
    localStorage.setItem(GENERATOR_POINTS_BUILDER_KOTLIN_END_KEY, snapshot.kotlinEndMode);
    localStorage.setItem(
      GENERATOR_POINTS_BUILDER_CONTEXT_KEY,
      JSON.stringify({ ...identity, seededAt })
    );
  } catch {
    // ignore storage quota errors
  }
}

function saveBuilderToEmitter() {
  let storedState = null;
  let projectName = '';
  let kotlinEndMode = '';
  try {
    const raw = localStorage.getItem(GENERATOR_POINTS_BUILDER_STATE_KEY);
    storedState = raw ? JSON.parse(raw) : null;
    projectName = localStorage.getItem(GENERATOR_POINTS_BUILDER_NAME_KEY) || '';
    kotlinEndMode = localStorage.getItem(GENERATOR_POINTS_BUILDER_KOTLIN_END_KEY) || '';
  } catch {
    return null;
  }
  if (!storedState) return null;

  const project = loadGeneratorProject();
  const target = findTargetEmitter(project);
  if (!target) return null;
  target.emitter.builderState = mergeGeneratorPointsBuilderSnapshot(
    target.emitter.builderState,
    storedState,
    {
      projectName,
      kotlinEndMode
    }
  );
  project.selectedEmitterId = target.id;
  saveGeneratorProject(project);
  try {
    localStorage.removeItem(GENERATOR_POINTS_BUILDER_CONTEXT_KEY);
  } catch {
    // ignore storage errors
  }
  return project;
}

async function saveBackToGenerator() {
  const project = saveBuilderToEmitter();
  if (!project || !projectId.value) return;
  await projectRepository.save({
    id: projectId.value,
    tool: 'generator',
    name: project.name || project.kotlin?.className || 'EmitterGenerator',
    description: project.description || '',
    payload: project
  });
}

watch(
  () => [emitterId.value, projectId.value],
  seedPointsBuilderFrame,
  { immediate: true }
);
</script>
