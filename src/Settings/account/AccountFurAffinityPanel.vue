<template>
<v-expansion-panel value="furaffinity">
  <v-expansion-panel-title>
    <account-panel-title
      title="FurAffinity"
      :status="faStatus"
      :connected="faLoggedIn"
      :probe="faAuth"
    />
  </v-expansion-panel-title>
  <v-expansion-panel-text>
    <v-text-field
      variant="filled"
      label="FurAffinity username"
      type="text"
      v-model="fields.furaffinity.username"
      autocomplete="username"
      :disabled="faLoggedIn"
    />
    <v-text-field
      v-if="!faLoggedIn"
      variant="filled"
      :append-icon="showSecret.furaffinity ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showSecret.furaffinity ? 'text' : 'password'"
      label="FurAffinity password"
      v-model="faPassword"
      @click:append="showSecret.furaffinity = !showSecret.furaffinity"
      autocomplete="current-password"
    />
    <v-text-field
      v-if="!faLoggedIn"
      variant="filled"
      :append-icon="showFaCookies ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showFaCookies ? 'text' : 'password'"
      label="FA_COOKIE_A"
      v-model="faCookieA"
      @click:append="showFaCookies = !showFaCookies"
      autocomplete="off"
    />
    <v-text-field
      v-if="!faLoggedIn"
      variant="filled"
      :append-icon="showFaCookies ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showFaCookies ? 'text' : 'password'"
      label="FA_COOKIE_B"
      v-model="faCookieB"
      @click:append="showFaCookies = !showFaCookies"
      autocomplete="off"
    />
    <details class="text-left mb-2">
      <summary class="text-caption text-medium-emphasis account-help-summary">
        Cookie / login help
      </summary>
      <p class="text-left text-caption mt-1 mb-0">
        Paste <code>a</code>/<code>b</code> cookies here to sign in — they are stored in
        settings and included in Backup JSON.
        <strong>Precedence:</strong> profile cookies override host
        <code>FA_COOKIE_A</code>/<code>FA_COOKIE_B</code>; if the profile has none,
        the host env is used; otherwise guest/SFW. Password login is a fallback; the
        password is not saved. Do not log out of the FurAffinity session those cookies
        belong to. Open
        <external-link href="https://www.furaffinity.net/login/">
          FurAffinity login
        </external-link>
        if you need to sign in first.
      </p>
      <p class="text-left text-caption mt-2 mb-0">
        <strong>Chrome / Chromium:</strong>
        log in on furaffinity.net → F12 → Application → Cookies →
        <code>https://www.furaffinity.net</code> → copy the Values for
        <code>a</code> and <code>b</code> into the fields above (or host env).
      </p>
      <p class="text-left text-caption mt-2 mb-0">
        <strong>Firefox:</strong>
        log in on furaffinity.net → F12 → Storage → Cookies →
        <code>https://www.furaffinity.net</code> → copy the Values for
        <code>a</code> and <code>b</code> the same way.
      </p>
    </details>
    <div>
      <v-btn
        v-if="!faLoggedIn"
        :disabled="!canFaPasswordLogin && !canFaCookieLogin"
        :loading="faAuth.loading"
        :color="faAuth.success ? 'success' : faAuth.message ? 'error' : 'accent'"
        variant="text"
        @click="canFaCookieLogin ? loginFurAffinityCookies() : loginFurAffinity()"
      >
        {{ canFaCookieLogin ? "Log in with cookies" : "Log in" }}
      </v-btn>
      <v-btn
        v-else
        :loading="faAuth.loading"
        color="accent"
        variant="text"
        @click="logoutFurAffinity"
      >
        Log out
      </v-btn>
      <v-btn
        v-if="!faLoggedIn && faNeedsBrowserLogin"
        color="accent"
        variant="text"
        @click="openFaLoginPage"
      >
        Open FurAffinity login
      </v-btn>
      <p v-if="faAuth.message">{{ faAuth.message }}</p>
    </div>
    <v-btn
      class="mt-4"
      :disabled="!faLoggedIn"
      color="accent"
      variant="text"
      @click="toggleFaFollowingSearch"
    >
      {{ faFollowingExists ? `Remove "Following" saved search` : `Add "Following" saved search` }}
    </v-btn>
    <v-btn
      class="mt-2"
      :disabled="!faLoggedIn && !fields.furaffinity.username"
      color="accent"
      variant="text"
      @click="toggleFaFavsSearch"
    >
      {{ faFavsExists ? `Remove "My Favs" saved search` : `Add "My Favs" saved search` }}
    </v-btn>
    <v-btn
      class="mt-2"
      :disabled="!faLoggedIn"
      :loading="faWatchlistLoading"
      color="accent"
      variant="text"
      @click="addFaWatchlistSearches"
    >
      Add watchlist artists as saved searches
    </v-btn>
  </v-expansion-panel-text>
</v-expansion-panel>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import ExternalLink from "@/App/ExternalLink.vue";
import AccountPanelTitle from "../AccountPanelTitle.vue";
import {
  clearAuthProbe,
  emptyAuth,
  markAuthProbe,
} from "../accountAuth";
import { useAccountFields } from "../useAccountFields";
import { useMainStore } from "@/services";
import { liveSearches, setLiveAccount, profileHasAuthMaterial } from "@/services/siteProfiles";
import {
  addSearchTag,
  searchesHaveTag,
  toggleSearchTag,
} from "@/services/savedSearchNormalize";
import { getApiService } from "@/worker/services";
import { openUrlInNewTab } from "@/misc/util/url";

const FA_LOGIN_URL = "https://www.furaffinity.net/login/";
const main = useMainStore();
const fields = { furaffinity: useAccountFields("furaffinity") };
const showSecret = reactive({ furaffinity: false });
const faPassword = ref("");
const faCookieA = ref("");
const faCookieB = ref("");
const showFaCookies = ref(false);
const faWatchlistLoading = ref(false);
const faAuth = ref(emptyAuth());
const faLoggedIn = computed(
  () => profileHasAuthMaterial("furaffinity", fields.furaffinity),
);
const canFaPasswordLogin = computed(
  () => !!(fields.furaffinity.username && faPassword.value),
);
const canFaCookieLogin = computed(() => !!(faCookieA.value.trim() && faCookieB.value.trim()));
const faNeedsBrowserLogin = computed(() => {
  const msg = (faAuth.value.message || "").toLowerCase();
  return msg.includes("captcha") || msg.includes("challenge");
});
const openFaLoginPage = () => openUrlInNewTab(FA_LOGIN_URL);
const faStatus = computed(() =>
  faLoggedIn.value
    ? fields.furaffinity.username
      ? `Signed in as ${fields.furaffinity.username}`
      : "Cookies saved (profile)"
    : "No credentials saved (host FA_COOKIE_* not shown)",
);
const FA_FAVS_TAG = "favs:me";
const FA_FOLLOWING_TAG = "following:me";
const faFavsExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "furaffinity"), FA_FAVS_TAG),
);
const faFollowingExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "furaffinity"), FA_FOLLOWING_TAG),
);
const toggleFaFavsSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "furaffinity"), FA_FAVS_TAG, "My Favs");
const toggleFaFollowingSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "furaffinity"), FA_FOLLOWING_TAG, "Following");

const applyFaLoginResult = (result: {
  username: string;
  cookies: string;
  cookieSource?: string;
}) => {
  setLiveAccount(main.$state, "furaffinity", {
    username: result.username,
    apiKey: result.cookies,
  });
  fields.furaffinity.username = result.username;
  faPassword.value = "";
  faCookieA.value = "";
  faCookieB.value = "";
  addSearchTag(liveSearches(main.$state, "furaffinity"), FA_FOLLOWING_TAG, "Following");
  addSearchTag(liveSearches(main.$state, "furaffinity"), FA_FAVS_TAG, "My Favs");
  const sourceHint =
    result.cookieSource === "profile"
      ? " (using profile cookies)"
      : result.cookieSource === "env"
        ? " (using host FA_COOKIE_*)"
        : result.cookieSource === "guest"
          ? " (guest)"
          : "";
  markAuthProbe(faAuth.value, true, `Logged in as ${result.username}${sourceHint}`);
};

const loginFurAffinity = async () => {
  if (!canFaPasswordLogin.value) return;
  faAuth.value.loading = true;
  faAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginFurAffinity({
      username: fields.furaffinity.username,
      password: faPassword.value,
    });
    applyFaLoginResult(result);
  } catch (e: any) {
    markAuthProbe(faAuth.value, false, e?.message || String(e));
  } finally {
    faAuth.value.loading = false;
  }
};

const loginFurAffinityCookies = async () => {
  if (!canFaCookieLogin.value) return;
  faAuth.value.loading = true;
  faAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginFurAffinityCookies({
      cookieA: faCookieA.value,
      cookieB: faCookieB.value,
    });
    applyFaLoginResult(result);
  } catch (e: any) {
    markAuthProbe(faAuth.value, false, e?.message || String(e));
  } finally {
    faAuth.value.loading = false;
  }
};

const logoutFurAffinity = async () => {
  faAuth.value.loading = true;
  try {
    const service = await getApiService();
    await service.logoutFurAffinity();
  } catch {
    // cookies may already be dead
  } finally {
    setLiveAccount(main.$state, "furaffinity", {
      username: null,
      apiKey: null,
    });
    faPassword.value = "";
    faCookieA.value = "";
    faCookieB.value = "";
    faAuth.value.loading = false;
    clearAuthProbe(faAuth.value);
    faAuth.value.message = "Logged out. Host FA_COOKIE_A/B still apply if set.";
  }
};

const addFaWatchlistSearches = async () => {
  faWatchlistLoading.value = true;
  try {
    const service = await getApiService();
    const watches = await service.getFurAffinityWatchlist({
      cookies: fields.furaffinity.apiKey,
      username: fields.furaffinity.username,
    });
    let added = 0;
    for (const watch of watches) {
      if (addSearchTag(liveSearches(main.$state, "furaffinity"), `artist:${watch.name}`, watch.name)) {
        added += 1;
      }
    }
    faAuth.value.message =
      added > 0
        ? `Added ${added} watchlist artist search${added === 1 ? "" : "es"}`
        : "No new watchlist artists to add";
  } catch (e: any) {
    faAuth.value.message = e?.message || String(e);
  } finally {
    faWatchlistLoading.value = false;
  }
};

watch(faPassword, () => {
  clearAuthProbe(faAuth.value);
});

</script>

<style scoped>
.account-help-summary {
  cursor: pointer;
  user-select: none;
}
.fill-width {
  width: 100%;
}
</style>
