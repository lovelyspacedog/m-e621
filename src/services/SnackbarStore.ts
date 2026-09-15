import { defineStore } from "pinia";
import { ref } from "vue";

/** Transient UI toasts — not part of persisted settings (L3). */
export const useSnackbarStore = defineStore("snackbar", () => {
  const message = ref<string | null>(null);
  const addMessage = (value: string) => {
    message.value = value;
  };
  const clearMessage = () => {
    message.value = null;
  };

  return {
    message,
    addMessage,
    clearMessage,
  };
});
