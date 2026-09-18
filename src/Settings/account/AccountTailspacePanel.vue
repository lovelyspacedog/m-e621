<template>
<v-expansion-panel value="tailspace">
  <v-expansion-panel-title>
    <account-panel-title
      title="Tailspace"
      :status="tsStatus"
      :connected="tsLoggedIn"
      :probe="tsAuth"
    />
  </v-expansion-panel-title>
  <v-expansion-panel-text>
    <v-text-field
      variant="filled"
      label="Tailspace username"
      type="text"
      v-model="fields.tailspace.username"
      autocomplete="username"
      :disabled="tsLoggedIn"
    />
    <v-text-field
      v-if="!tsLoggedIn"
      variant="filled"
      :append-icon="showSecret.tailspace ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showSecret.tailspace ? 'text' : 'password'"
      label="Tailspace password"
      v-model="tsPassword"
      @click:append="showSecret.tailspace = !showSecret.tailspace"
      autocomplete="new-password"
    />
    <v-text-field
      v-if="!tsLoggedIn"
      variant="filled"
      :append-icon="showTsCookie ? 'mdi-eye-off' : 'mdi-eye'"
      :type="showTsCookie ? 'text' : 'password'"
      label="tailspace_session cookie"
      v-model="tsCookie"
      @click:append="showTsCookie = !showTsCookie"
      autocomplete="off"
    />
    <details class="text-left mb-2">
      <summary class="text-caption text-medium-emphasis account-help-summary">
        Cookie / login help
      </summary>
      <p class="text-left text-caption mt-1 mb-0">
        Paste the <code>tailspace_session</code> cookie value (or
        <code>tailspace_session=…</code>) to sign in — it is stored in settings and
        included in Backup JSON. Password login is a fallback; the password is not
        saved. Do not log out of the Tailspace session that cookie belongs to.
      </p>
      <p class="text-left text-caption mt-2 mb-0">
        <strong>Chrome / Firefox:</strong>
        log in on
        <external-link href="https://tailspace.com/login">tailspace.com</external-link>
        → F12 → Application/Storage → Cookies →
        <code>https://tailspace.com</code> → copy the Value for
        <code>tailspace_session</code>.
      </p>
    </details>
    <div>
      <v-btn
        v-if="!tsLoggedIn"
        :disabled="!canTsPasswordLogin && !canTsCookieLogin"
        :loading="tsAuth.loading"
        :color="tsAuth.success ? 'success' : tsAuth.message ? 'error' : 'accent'"
        variant="text"
        @click="canTsCookieLogin ? loginTailspaceCookies() : loginTailspace()"
      >
        {{ canTsCookieLogin ? "Log in with cookie" : "Log in" }}
      </v-btn>
      <v-btn
        v-else
        :loading="tsAuth.loading"
        color="accent"
        variant="text"
        @click="logoutTailspace"
      >
        Log out
      </v-btn>
      <p v-if="tsAuth.message">{{ tsAuth.message }}</p>
    </div>
  </v-expansion-panel-text>
</v-expansion-panel>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import ExternalLink from "@/App/ExternalLink.vue";
import AccountPanelTitle from "../AccountPanelTitle.vue";
import {
  clearAuthProbe,
  emptyAuth,
  markAuthProbe,
} from "../accountAuth";
import { useAccountFields } from "../useAccountFields";
import { useMainStore } from "@/services";
import { setLiveAccount, profileHasAuthMaterial } from "@/services/siteProfiles";
import { getApiService } from "@/worker/services";


const main = useMainStore();
const fields = { tailspace: useAccountFields("tailspace") };
const showSecret = reactive({ tailspace: false });
const tsPassword = ref("");
const tsCookie = ref("");
const showTsCookie = ref(false);
const tsAuth = ref(emptyAuth());
const tsLoggedIn = computed(() =>
  profileHasAuthMaterial("tailspace", fields.tailspace),
);
const canTsPasswordLogin = computed(
  () => !!(fields.tailspace.username && tsPassword.value),
);
const canTsCookieLogin = computed(() => !!tsCookie.value.trim());
const tsStatus = computed(() =>
  tsLoggedIn.value
    ? fields.tailspace.username
      ? `Signed in as ${fields.tailspace.username}`
      : "Session cookie saved"
    : "No credentials saved",
);

const applyTsLoginResult = (result: {
  username: string;
  cookies: string;
  userId?: number | null;
}) => {
  setLiveAccount(main.$state, "tailspace", {
    username: result.username,
    apiKey: result.cookies,
    userId: result.userId ?? null,
  });
  fields.tailspace.username = result.username;
  tsPassword.value = "";
  tsCookie.value = "";
  markAuthProbe(tsAuth.value, true, `Logged in as ${result.username}`);
};

const loginTailspace = async () => {
  if (!canTsPasswordLogin.value) return;
  tsAuth.value.loading = true;
  tsAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginTailspace({
      username: fields.tailspace.username,
      password: tsPassword.value,
    });
    applyTsLoginResult(result);
  } catch (e: unknown) {
    markAuthProbe(tsAuth.value, false, e instanceof Error ? e.message : String(e));
  } finally {
    tsAuth.value.loading = false;
  }
};

const loginTailspaceCookies = async () => {
  if (!canTsCookieLogin.value) return;
  tsAuth.value.loading = true;
  tsAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginTailspaceCookies({
      cookies: tsCookie.value,
    });
    applyTsLoginResult(result);
  } catch (e: unknown) {
    markAuthProbe(tsAuth.value, false, e instanceof Error ? e.message : String(e));
  } finally {
    tsAuth.value.loading = false;
  }
};

const logoutTailspace = async () => {
  tsAuth.value.loading = true;
  const cookies = fields.tailspace.apiKey;
  try {
    const service = await getApiService();
    await service.logoutTailspace({ cookies });
  } catch {
    // session may already be dead
  } finally {
    setLiveAccount(main.$state, "tailspace", {
      username: null,
      apiKey: null,
      userId: null,
    });
    tsPassword.value = "";
    tsCookie.value = "";
    tsAuth.value.loading = false;
    clearAuthProbe(tsAuth.value);
    tsAuth.value.message = "Logged out";
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
