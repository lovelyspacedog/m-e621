import { onScopeDispose, watchEffect } from "vue";
import { useMainStore } from "@/services";
import { liveAccount, setLiveAccount } from "@/services/siteProfiles";
import {
  onTailspaceSessionCleared,
  setActiveTailspaceSession,
} from "@/worker/tailspace/api";

/** Keep the Tailspace proxy session header in sync with the profile apiKey. */
export function useTailspaceSession() {
  const main = useMainStore();
  watchEffect(() => {
    setActiveTailspaceSession(liveAccount(main.$state, "tailspace").apiKey);
  });
  const stop = onTailspaceSessionCleared(() => {
    setLiveAccount(main.$state, "tailspace", {
      apiKey: "",
      username: "",
      userId: null,
    });
    setActiveTailspaceSession(null);
  });
  onScopeDispose(stop);
  return {
    isLoggedIn: () => !!liveAccount(main.$state, "tailspace").apiKey,
    username: () => liveAccount(main.$state, "tailspace").username,
  };
}
