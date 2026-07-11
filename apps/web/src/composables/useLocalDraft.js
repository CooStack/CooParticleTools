import { ref, watch } from 'vue';
import { deepClone } from '../utils/clone.js';

export function useLocalDraft(storageKey, createDefaultValue) {
  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return createDefaultValue();
      return { ...createDefaultValue(), ...JSON.parse(raw) };
    } catch {
      return createDefaultValue();
    }
  }

  const draft = ref(load());

  watch(draft, (value) => {
    localStorage.setItem(storageKey, JSON.stringify(value));
  }, { deep: true });

  function replace(nextValue) {
    draft.value = deepClone(nextValue);
  }

  function reset() {
    draft.value = createDefaultValue();
  }

  return {
    draft,
    replace,
    reset
  };
}
