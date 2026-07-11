import { ref } from 'vue';

export function useApi() {
  const loading = ref(false);
  const error = ref('');

  async function run(task) {
    loading.value = true;
    error.value = '';
    try {
      return await task();
    } catch (reason) {
      error.value = reason?.message || String(reason);
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    run
  };
}
