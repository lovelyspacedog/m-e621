import { defineStore } from "pinia";
import { ref } from "vue";

export const usePwaUpdateStore = defineStore("pwaUpdate", () => {
  const needRefresh = ref(false);
  let applyUpdate: (() => Promise<void>) | null = null;

  const setNeedRefresh = (updater: () => Promise<void>) => {
    applyUpdate = updater;
    needRefresh.value = true;
  };

  const dismiss = () => {
    // Keep applyUpdate so a later banner/session can still apply this waiting SW (L14).
    needRefresh.value = false;
  };

  const reload = async () => {
    if (applyUpdate) {
      await applyUpdate();
    } else {
      window.location.reload();
    }
  };

  return {
    needRefresh,
    setNeedRefresh,
    dismiss,
    reload,
  };
});
