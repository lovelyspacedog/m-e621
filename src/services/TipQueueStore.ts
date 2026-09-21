import { defineStore } from "pinia";
import { computed, ref } from "vue";

/** FIFO queue for one-at-a-time tip toasts — transient UI, not persisted. */
export const useTipQueueStore = defineStore("tipQueue", () => {
  const queue = ref<string[]>([]);
  /** Pixel height of the active tip toast (for snackbar offset). */
  const activeHeight = ref(0);

  const activeTipId = computed(() => queue.value[0] ?? null);
  const hasActive = computed(() => queue.value.length > 0);

  const enqueue = (tipId: string) => {
    if (queue.value.includes(tipId)) return;
    queue.value = [...queue.value, tipId];
  };

  const remove = (tipId: string) => {
    const wasActive = queue.value[0] === tipId;
    const next = queue.value.filter((id) => id !== tipId);
    if (next.length === queue.value.length) return;
    queue.value = next;
    if (wasActive) activeHeight.value = 0;
  };

  const setActiveHeight = (tipId: string, height: number) => {
    if (queue.value[0] !== tipId) return;
    activeHeight.value = Math.max(0, Math.round(height));
  };

  const clearActiveHeight = (tipId: string) => {
    if (queue.value[0] === tipId) activeHeight.value = 0;
  };

  return {
    queue,
    activeHeight,
    activeTipId,
    hasActive,
    enqueue,
    remove,
    setActiveHeight,
    clearActiveHeight,
  };
});
