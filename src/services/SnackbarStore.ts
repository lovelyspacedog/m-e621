import { defineStore } from "pinia";
import { ref } from "vue";

export type SnackbarAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

/** Transient UI toasts — not part of persisted settings (L3). */
export const useSnackbarStore = defineStore("snackbar", () => {
  const message = ref<string | null>(null);
  const action = ref<SnackbarAction | null>(null);

  const addMessage = (value: string, nextAction?: SnackbarAction | null) => {
    message.value = value;
    action.value = nextAction ?? null;
  };
  const clearMessage = () => {
    message.value = null;
    action.value = null;
  };

  return {
    message,
    action,
    addMessage,
    clearMessage,
  };
});
