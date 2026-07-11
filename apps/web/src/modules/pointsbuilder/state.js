import { deepClone } from '../../utils/clone.js';
import { getFirstNodeId, findNodeById } from './node-helpers.js';

function createHistoryState(limit = 60) {
  return {
    limit: Number(limit || 60),
    undoStack: [],
    redoStack: [],
    lastSnapshot: '',
    suspended: false,
    timer: null
  };
}

export function createPointsBuilderEditorState(project, options = {}) {
  return {
    selectedNodeId: getFirstNodeId(project),
    history: createHistoryState(options.limit)
  };
}

function serialize(project) {
  return JSON.stringify(project || {});
}

function scheduleRelease(history) {
  setTimeout(() => {
    history.suspended = false;
  }, 0);
}

export function resetProjectHistory(editorState, project) {
  const history = editorState.history;
  clearTimeout(history.timer);
  history.undoStack = [];
  history.redoStack = [];
  history.lastSnapshot = serialize(project);
  history.suspended = false;
}

export function recordProjectSnapshot(editorState, project, debounceMs = 180) {
  const history = editorState.history;
  if (history.suspended) return;

  const nextSnapshot = serialize(project);
  if (!history.lastSnapshot) {
    history.lastSnapshot = nextSnapshot;
    return;
  }
  if (nextSnapshot === history.lastSnapshot) return;

  const previous = history.lastSnapshot;
  clearTimeout(history.timer);
  history.timer = setTimeout(() => {
    history.undoStack.push(previous);
    if (history.undoStack.length > history.limit) {
      history.undoStack.shift();
    }
    history.redoStack = [];
    history.lastSnapshot = nextSnapshot;
  }, debounceMs);
}

function applyHistorySnapshot(editorState, snapshot, targetStack) {
  const history = editorState.history;
  if (!snapshot) return null;
  clearTimeout(history.timer);
  targetStack.push(history.lastSnapshot);
  history.suspended = true;
  history.lastSnapshot = snapshot;
  scheduleRelease(history);
  return deepClone(JSON.parse(snapshot));
}

export function undoProject(editorState) {
  const history = editorState.history;
  const snapshot = history.undoStack.pop();
  return applyHistorySnapshot(editorState, snapshot, history.redoStack);
}

export function redoProject(editorState) {
  const history = editorState.history;
  const snapshot = history.redoStack.pop();
  return applyHistorySnapshot(editorState, snapshot, history.undoStack);
}

export function syncEditorSelection(editorState, project) {
  const current = editorState.selectedNodeId;
  if (current && findNodeById(project?.state?.root?.children || [], current)) {
    return current;
  }
  const next = getFirstNodeId(project);
  editorState.selectedNodeId = next;
  return next;
}

export function selectNode(editorState, project, nodeId) {
  if (nodeId && findNodeById(project?.state?.root?.children || [], nodeId)) {
    editorState.selectedNodeId = nodeId;
    return;
  }
  syncEditorSelection(editorState, project);
}

export function disposeEditorState(editorState) {
  clearTimeout(editorState?.history?.timer);
}
