import { defineStore } from "pinia";
import { ref } from "vue";

export const usePwaUpdateStore = defineStore("pwaUpdate", () => {
  const needRefresh = ref(false);
  let applyUpdate: (() => Promise<void>) | null = null;
  let reloading = false;

  const setNeedRefresh = (updater: () => Promise<void>) => {
    applyUpdate = updater;
    needRefresh.value = true;
  };

  const dismiss = () => {
    // Keep applyUpdate so a later banner/session can still apply this waiting SW (L14).
    needRefresh.value = false;
  };

  const reload = async () => {
    if (reloading) return;
    reloading = true;
    try {
      if (applyUpdate) {
        await applyUpdate();
        return;
      }
    } catch (err) {
      console.error("PWA update failed", err);
    }
    window.location.reload();
  };

  return {
    needRefresh,
    setNeedRefresh,
    dismiss,
    reload,
  };
});
