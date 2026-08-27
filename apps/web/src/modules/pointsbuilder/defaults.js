import { createPointsBuilderBaseProject } from './schema.js';
import {
  createNodeByKind,
  createFourierTerm,
  cloneNodeDeep,
  cloneNodeListDeep,
  replaceListContents,
  mirrorPointByPlane,
  mirrorCopyNode,
  isBuilderContainerKind,
  visitNodes,
  findNodeContext,
  findNodeById,
  removeNodeById,
  getProjectNodes,
  getFirstNodeId
} from './node-helpers.js';
import { normalizePointsBuilderProject } from './normalizer.js';
export {
  BUILDER_REFERENCE_KIND,
  EFFECT_RING_KIND,
  EFFECT_GROUP_LABEL,
  BUILDER_REFERENCE_SCHEMA_VERSION,
  normalizeBuilderSnapshots,
  createBuilderSnapshot,
  createBuilderSnapshotStore,
  createBuilderSnapshotFromPreset,
  createBuilderReferenceNode,
  createEffectRingNode,
  materializeBuilderReferences,
  expandBuilderReferences,
  flattenBuilderReferencesForPreset,
  saveBuilderPresetWithSnapshot,
  resolveBuilderReferenceSnapshot,
  builderReferenceCacheKey,
  kotlinPrivateParameterConstantName,
  getBuilderSnapshotRevision,
  invalidateBuilderSnapshotCache
} from './references.js';

export function createPointsBuilderProject(tool = 'pointsbuilder') {
  const project = createPointsBuilderBaseProject(tool);
  const seed = createNodeByKind('add_circle');
  project.state.root.children.push(seed);
  project.state.selection.focusedNodeId = seed.id;
  return project;
}

export {
  createNodeByKind,
  createFourierTerm,
  cloneNodeDeep,
  cloneNodeListDeep,
  replaceListContents,
  mirrorPointByPlane,
  mirrorCopyNode,
  isBuilderContainerKind,
  visitNodes,
  findNodeContext,
  findNodeById,
  removeNodeById,
  getProjectNodes,
  getFirstNodeId,
  normalizePointsBuilderProject
};
