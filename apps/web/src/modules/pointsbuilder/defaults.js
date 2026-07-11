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
