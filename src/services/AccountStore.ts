import { defineStore } from "pinia";
import { computed } from "vue";
import { useMainStore } from "./state";

export const useAccountStore = defineStore("account", () => {
  const main = useMainStore();
  const username = computed({
    get() {
      return main.account.username;
    },
    set(value) {
      main.account.username = value;
    },
  });
  const apiKey = computed({
    get() {
      return main.account.apiKey;
    },
    set(value) {
      main.account.apiKey = value;
    },
  });
  const userId = computed({
    get() {
      return main.account.userId ?? null;
    },
    set(value) {
      main.account.userId = value;
    },
  });
  // Mode-aware: Furbooru is API-key-only (no username). FurAffinity may use
  // host env cookies with no profile key. e621/e6ai/Inkbunny need both.
  const auth = computed(() => {
    const api_key = main.account.apiKey;
    if (main.activeMode === "furaffinity") {
      return {
        login: main.account.username || "",
        api_key: api_key || "",
      };
    }
    if (!api_key) return undefined;
    if (main.activeMode === "furbooru") {
      return {
        login: main.account.username || "",
        api_key,
      };
    }
    if (!main.account.username) return undefined;
    return {
      login: main.account.username,
      api_key,
    };
  });

  return {
    username,
    apiKey,
    userId,
    auth,
  };
});
