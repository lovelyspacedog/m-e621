<template>
<v-expansion-panel value="sofurry">
  <v-expansion-panel-title>
    <account-panel-title
      title="SoFurry"
      :status="sofurryStatus"
      :connected="sofurryLoggedIn"
      :probe="sofurryAuth"
    />
  </v-expansion-panel-title>
  <v-expansion-panel-text>
    <v-text-field
      variant="filled"
      label="SoFurry email"
      type="email"
      v-model="sofurryEmail"
      autocomplete="email"
      :disabled="sofurryLoggedIn"
    />
    <v-text-field
      variant="filled"
      label="SoFurry username (from login)"
      type="text"
      v-model="fields.sofurry.username"
      autocomplete="username"
      :disabled="sofurryLoggedIn"
    />
    <v-text-field
      v-if="!sofurryLoggedIn"
      variant="filled"
      :append-icon="showSecret.sofurry ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showSecret.sofurry ? 'text' : 'password'"
      label="SoFurry password"
      v-model="sofurryPassword"
      @click:append="showSecret.sofurry = !showSecret.sofurry"
      autocomplete="current-password"
    />
    <v-text-field
      v-if="!sofurryLoggedIn"
      variant="filled"
      :append-icon="showSofurryCookies ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showSofurryCookies ? 'text' : 'password'"
      label="Session cookies"
      v-model="sofurryCookiePaste"
      @click:append="showSofurryCookies = !showSofurryCookies"
      autocomplete="off"
    />
    <details class="text-left mb-2">
      <summary class="text-caption text-medium-emphasis account-help-summary">
        Cookie / login help
      </summary>
      <p class="text-left text-caption mt-1 mb-0">
        Sign in with email/password, or paste SoFurry cookies from DevTools.
        Prefer the Remix <code>_session</code> value (or both
        <code>_session</code> and <code>sofurry_session</code>). A bare cookie
        value is fine — PawFeed will name it. Cookies are stored in settings and
        Backup JSON; the password is not saved.
      </p>
      <p class="text-left text-caption mt-2 mb-0">
        <strong>Chrome / Firefox:</strong>
        log in on
        <external-link href="https://sofurry.com/">sofurry.com</external-link>
        → F12 → Application/Storage → Cookies →
        <code>https://sofurry.com</code> → copy <code>_session</code>
        (and <code>sofurry_session</code> if present).
      </p>
    </details>
    <div>
      <v-btn
        v-if="!sofurryLoggedIn"
        :disabled="!canSofurryPasswordLogin && !canSofurryCookieLogin"
        :loading="sofurryAuth.loading"
        :color="sofurryAuth.success ? 'success' : sofurryAuth.message ? 'error' : 'accent'"
        variant="text"
        @click="canSofurryCookieLogin ? loginSofurryCookies() : loginSofurry()"
      >
        {{ canSofurryCookieLogin ? "Log in with cookies" : "Log in" }}
      </v-btn>
      <v-btn
        v-else
        :loading="sofurryAuth.loading"
        color="accent"
        variant="text"
        @click="logoutSofurry"
      >
        Log out
      </v-btn>
      <p v-if="sofurryAuth.message">{{ sofurryAuth.message }}</p>
    </div>
    <v-btn
      class="mt-2"
      :disabled="!sofurryLoggedIn"
      color="accent"
      variant="text"
      @click="toggleSofurryLikesSearch"
    >
      {{ sofurryLikesExists ? `Remove "My Likes" saved search` : `Add "My Likes" saved search` }}
    </v-btn>
    <v-btn
      class="mt-2"
      :disabled="!sofurryLoggedIn"
      color="accent"
      variant="text"
      @click="toggleSofurryFollowingSearch"
    >
      {{ sofurryFollowingExists ? `Remove "Following" saved search` : `Add "Following" saved search` }}
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


const main = useMainStore();
const fields = { sofurry: useAccountFields("sofurry") };
const showSecret = reactive({ sofurry: false });
const SOFURRY_LIKES_TAG = "favs:me";
const SOFURRY_FOLLOWING_TAG = "following:me";
const sofurryEmail = ref(fields.sofurry.username || "");
const sofurryPassword = ref("");
const sofurryCookiePaste = ref("");
const showSofurryCookies = ref(false);
const sofurryAuth = ref(emptyAuth());
const sofurryLoggedIn = computed(() =>
  profileHasAuthMaterial("sofurry", fields.sofurry),
);
const canSofurryPasswordLogin = computed(
  () => !!(sofurryEmail.value.trim() && sofurryPassword.value),
);
const canSofurryCookieLogin = computed(() => !!sofurryCookiePaste.value.trim());
const sofurryStatus = computed(() =>
  sofurryLoggedIn.value
    ? fields.sofurry.username
      ? `Signed in as ${fields.sofurry.username}`
      : "Session cookies saved"
    : "No credentials saved",
);
const sofurryLikesExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "sofurry"), SOFURRY_LIKES_TAG),
);
const sofurryFollowingExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "sofurry"), SOFURRY_FOLLOWING_TAG),
);
const toggleSofurryLikesSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "sofurry"), SOFURRY_LIKES_TAG, "My Likes");
const toggleSofurryFollowingSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "sofurry"), SOFURRY_FOLLOWING_TAG, "Following");

const applySofurryLoginResult = (result: {
  username?: string;
  cookies?: string;
}) => {
  const username = result.username;
  const cookies = result.cookies || "";
  if (!username || !cookies) {
    markAuthProbe(sofurryAuth.value, false, "Login did not return a Soft username/session");
    return;
  }
  setLiveAccount(main.$state, "sofurry", {
    username,
    apiKey: cookies,
    userId: null,
  });
  fields.sofurry.username = username;
  sofurryPassword.value = "";
  sofurryCookiePaste.value = "";
  addSearchTag(liveSearches(main.$state, "sofurry"), SOFURRY_FOLLOWING_TAG, "Following");
  addSearchTag(liveSearches(main.$state, "sofurry"), SOFURRY_LIKES_TAG, "My Likes");
  markAuthProbe(sofurryAuth.value, true, `Logged in as ${username}`);
};

const loginSofurry = async () => {
  if (!canSofurryPasswordLogin.value) return;
  sofurryAuth.value.loading = true;
  sofurryAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginSofurry({
      email: sofurryEmail.value.trim(),
      password: sofurryPassword.value,
    });
    if (!result.ok || !result.cookies) {
      throw new Error(result.error || "Login failed");
    }
    applySofurryLoginResult(result);
  } catch (e: any) {
    markAuthProbe(sofurryAuth.value, false, e?.message || String(e));
  } finally {
    sofurryAuth.value.loading = false;
  }
};

const loginSofurryCookies = async () => {
  if (!canSofurryCookieLogin.value) return;
  sofurryAuth.value.loading = true;
  sofurryAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginSofurryCookies({
      cookies: sofurryCookiePaste.value.trim(),
    });
    if (!result.ok || !result.cookies) {
      throw new Error(("error" in result && result.error) || "Cookies rejected");
    }
    applySofurryLoginResult(result);
  } catch (e: any) {
    markAuthProbe(sofurryAuth.value, false, e?.message || String(e));
  } finally {
    sofurryAuth.value.loading = false;
  }
};

const logoutSofurry = async () => {
  sofurryAuth.value.loading = true;
  try {
    const service = await getApiService();
    await service.logoutSofurry();
  } catch {
    /* ignore */
  } finally {
    setLiveAccount(main.$state, "sofurry", {
      username: null,
      apiKey: null,
      userId: null,
    });
    sofurryPassword.value = "";
    sofurryCookiePaste.value = "";
    sofurryAuth.value.loading = false;
    clearAuthProbe(sofurryAuth.value);
    sofurryAuth.value.message = "Logged out";
  }
};

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
