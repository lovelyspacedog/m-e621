import { watchEffect } from "vue";
import { useMainStore } from "@/services";
import { liveAccount } from "@/services/siteProfiles";
import { setActiveTailspaceSession } from "@/worker/tailspace/api";

/** Keep the Tailspace proxy session header in sync with the profile apiKey. */
export function useTailspaceSession() {
  const main = useMainStore();
  watchEffect(() => {
    setActiveTailspaceSession(liveAccount(main.$state, "tailspace").apiKey);
  });
  return {
    isLoggedIn: () => !!liveAccount(main.$state, "tailspace").apiKey,
    username: () => liveAccount(main.$state, "tailspace").username,
  };
}
