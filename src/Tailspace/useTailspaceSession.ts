import { useMainStore } from "@/services";
import { liveAccount } from "@/services/siteProfiles";

/** Tailspace profile session helpers for Vue pages. */
export function useTailspaceSession() {
  const main = useMainStore();
  return {
    isLoggedIn: () => !!liveAccount(main.$state, "tailspace").apiKey,
    username: () => liveAccount(main.$state, "tailspace").username,
  };
}
