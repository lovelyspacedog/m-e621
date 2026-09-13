import { registerSW } from "virtual:pwa-register";
import { usePwaUpdateStore } from "@/services/PwaUpdateStore";

const intervalMS = 60 * 60 * 1000;

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
        await updateSW(true);
      });
    },
    onOfflineReady() {
      console.log("offline ready");
    },
  });
};
