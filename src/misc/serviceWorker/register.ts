import { registerSW } from "virtual:pwa-register";
import { usePwaUpdateStore } from "@/services/PwaUpdateStore";

const intervalMS = 10 * 60 * 1000;

/**
 * Activate the waiting service worker and reload.
 * vite-plugin-pwa only reloads on Workbox `controlling` when `isUpdate` is
 * true; that flag is often missing, so Reload appeared to do nothing.
 */
const applyWaitingUpdate = async (
  updateSW: (reloadPage?: boolean) => Promise<void>,
) => {
  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, {
      once: true,
    });
  }

  await updateSW(true);
  // If skipWaiting/claim never fires controllerchange, still refresh assets.
  window.setTimeout(reloadOnce, 400);
};

export const registerServiceWorker = () => {
  const updateSW = registerSW({
    onRegistered(r) {
      r &&
        setInterval(() => {
          r.update();
        }, intervalMS);
    },
    onNeedRefresh() {
      const pwa = usePwaUpdateStore();
      pwa.setNeedRefresh(async () => {
        await applyWaitingUpdate(updateSW);
      });
    },
    onOfflineReady() {
      console.log("offline ready");
    },
  });
};
