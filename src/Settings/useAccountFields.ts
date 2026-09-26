import { reactive, computed } from "vue";
import { useMainStore } from "@/services";
import type { SiteMode } from "@/services/types";
import {
  liveAccount,
  liveBaseUrl,
  setLiveAccount,
  setLiveBaseUrl,
} from "@/services/siteProfiles";

/** Reactive username / apiKey / baseUrl bound to a site profile (and live mirrors). */
export const useAccountFields = (mode: SiteMode) => {
  const main = useMainStore();
  return reactive({
    username: computed({
      get: () => liveAccount(main.$state, mode).username || "",
      set: (value: string) =>
        setLiveAccount(main.$state, mode, { username: value || null }),
    }),
    apiKey: computed({
      get: () => liveAccount(main.$state, mode).apiKey || "",
      set: (value: string) =>
        setLiveAccount(main.$state, mode, { apiKey: value || null }),
    }),
    cookies: computed({
      get: () => liveAccount(main.$state, mode).cookies || "",
      set: (value: string) =>
        setLiveAccount(main.$state, mode, { cookies: value || null }),
    }),
    baseUrl: computed({
      get: () => liveBaseUrl(main.$state, mode),
      set: (value: string) => setLiveBaseUrl(main.$state, mode, value),
    }),
  });
};
