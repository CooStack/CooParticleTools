import { ref, watch } from 'vue';
import { deepClone } from '../utils/clone.js';

export function useUndoRedo(targetRef, options = {}) {
  const limit = Number(options.limit || 50);
  const undoStack = ref([]);
  const redoStack = ref([]);
  let suspended = false;
  let timer = null;
  let lastSnapshot = JSON.stringify(targetRef.value);

  watch(targetRef, (value) => {
    if (suspended) return;
    const nextSnapshot = JSON.stringify(value);
    if (nextSnapshot === lastSnapshot) return;
    clearTimeout(timer);
    const previous = lastSnapshot;
    timer = setTimeout(() => {
      undoStack.value.push(previous);
      if (undoStack.value.length > limit) undoStack.value.shift();
      redoStack.value = [];
      lastSnapshot = nextSnapshot;
    }, 180);
  }, { deep: true });

  function applySnapshot(snapshot) {
    suspended = true;
    targetRef.value = deepClone(JSON.parse(snapshot));
    lastSnapshot = snapshot;
    setTimeout(() => {
      suspended = false;
    }, 0);
  }

  function undo() {
    const snapshot = undoStack.value.pop();
    if (!snapshot) return;
    redoStack.value.push(lastSnapshot);
    applySnapshot(snapshot);
  }

  function redo() {
    const snapshot = redoStack.value.pop();
    if (!snapshot) return;
    undoStack.value.push(lastSnapshot);
    applySnapshot(snapshot);
  }

  function reset(value) {
    suspended = true;
    targetRef.value = deepClone(value);
    undoStack.value = [];
    redoStack.value = [];
    lastSnapshot = JSON.stringify(value);
    setTimeout(() => {
      suspended = false;
    }, 0);
  }

  return {
    undoStack,
    redoStack,
    undo,
    redo,
    reset
  };
}
