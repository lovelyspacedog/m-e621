<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title section="info" title="Info" color="teal-darken-2" />
        <settings-page-item title="Version Info" select>
          You are running {{ appName }}, which was last changed with commit
          <a :href="`https://github.com/lovelyspacedog/m-e621/commit/${commit.hash}`" target="_blank">{{
            commit.hash.substring(0, 7) }}</a>
          on <b>{{ commitDate }}</b> (this was <b>{{ commitDateRelative }}</b>) from branch <b>{{ branch }}</b>.
          <v-btn color="accent" variant="text" @click="forceUpdate" block>
            Force Update
          </v-btn>
          <v-btn color="accent" variant="text" to="/about" block> View Commits </v-btn>
        </settings-page-item>
        <settings-page-item
          v-if="gitPullEnabled"
          title="Pull from Git"
          description="Fetch origin, rebuild this instance, then reload. Requires the pull token from ~/.config/m-e621/pull_token on the host."
          select
        >
          <div class="text-left px-1 mb-2">
            Server HEAD:
            <code>{{ serverHeadShort }}</code>
            <span v-if="pullStatus"> — {{ pullStatus }}</span>
          </div>
          <v-btn
            color="accent"
            variant="text"
            block
            :loading="pullRunning"
            :disabled="pullRunning"
            @click="pullFromGit"
          >
            {{ pullRunning ? "Pulling / building…" : "Pull from Git" }}
          </v-btn>
          <v-btn color="accent" variant="text" block :disabled="pullRunning" @click="clearPullToken">
            Clear saved pull token
          </v-btn>
        </settings-page-item>
        <settings-page-item :title="`Storage`"
          description="Shows the storage used for cached files, settings and cached tags." select>
          <div class="text-left px-1">
            Persistence: permission {{ persistence ? "granted" : "not granted" }}
            <br />
            Used: {{ usageStr }}
          </div>
          <v-progress-linear color="accent" class="ma-1" indeterminante :model-value="usagePercentage" />
          <v-btn v-if="!persistence" variant="text" block color="accent" @click="requestPersistence">Request
            Persistence</v-btn>
        </settings-page-item>
        <settings-page-item title="Bookmarklet">
          <install />
        </settings-page-item>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import SettingsPageTitle from "./SettingsPageTitle.vue";
import SettingsPageItem from "./SettingsPageItem.vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import Install from "@/Settings/Install.vue";
import { getGitInfo, getGitBranchInfo } from "@/misc/util/git";
import { getAppName } from "@/misc/util/utilities";
import { format, formatDistanceToNow } from "date-fns";
import { prettyBytes } from "@/misc/util/prettyBytes";
import { useHead } from "@unhead/vue";

useHead({ title: "Info", });

const TOKEN_KEY = "m-e621-pull-token";
const gitPullEnabled = import.meta.env.VITE_ENABLE_GIT_PULL === "true";

const storage = reactive({
  used: 0,
  total: 0,
});
const usageStr = computed(
  () => `${prettyBytes(storage.used)} / ${prettyBytes(storage.total)}`,
);
const usagePercentage = computed(
  () => (storage.used / (storage.total || 1)) * 100,
);
navigator.storage.estimate().then((estimate) => {
  storage.used = estimate.usage || 0;
  storage.total = estimate.quota || 0;
});
const commit = getGitInfo()[0];
const branch = getGitBranchInfo();
const commitDate = computed(() => format(commit.date, "PP p"));
const commitDateRelative = computed(() =>
  formatDistanceToNow(commit.date, { addSuffix: true }),
);
const forceUpdate = () => {
  navigator.serviceWorker
    .getRegistrations()
    .then((re) => re.map((r) => r.unregister()))
    .then((p) => Promise.all(p))
    .then(() => caches.keys())
    .then((keys) => keys.map((key) => caches.delete(key)))
    .then((p) => Promise.all(p))
    .then(() => location.reload());
};
const persistence = ref<boolean>();

type GitStatus = {
  running?: boolean;
  ok?: boolean | null;
  message?: string;
  head?: string | null;
  before?: string | null;
  after?: string | null;
};

const pullRunning = ref(false);
const pullStatus = ref("");
const serverHead = ref<string | null>(null);
const serverHeadShort = computed(() =>
  serverHead.value ? serverHead.value.substring(0, 7) : "…",
);
let pollTimer: ReturnType<typeof setInterval> | undefined;

const getPullToken = (): string | null => {
  const saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved) return saved;
  const entered = window.prompt("Pull token (from ~/.config/m-e621/pull_token on the host):");
  if (!entered) return null;
  sessionStorage.setItem(TOKEN_KEY, entered.trim());
  return entered.trim();
};

const clearPullToken = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  pullStatus.value = "saved token cleared";
};

const refreshGitStatus = async () => {
  try {
    const res = await fetch("/api/git", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as GitStatus;
    serverHead.value = data.head ?? null;
    if (data.running) {
      pullRunning.value = true;
      pullStatus.value = data.message || "running";
    } else if (pullRunning.value && data.ok === true) {
      pullRunning.value = false;
      pullStatus.value = data.message || "done";
      stopPolling();
      forceUpdate();
    } else if (pullRunning.value && data.ok === false) {
      pullRunning.value = false;
      pullStatus.value = data.message || "failed";
      stopPolling();
    } else if (!pullRunning.value && data.message) {
      pullStatus.value = data.message;
    }
  } catch {
    // API only exists on the self-hosted serve.py instance.
  }
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(() => {
    void refreshGitStatus();
  }, 2000);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
};

const pullFromGit = async () => {
  const token = getPullToken();
  if (!token) {
    pullStatus.value = "cancelled — no token";
    return;
  }
  pullRunning.value = true;
  pullStatus.value = "starting";
  try {
    const res = await fetch("/api/git/pull", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Pull-Token": token,
      },
    });
    const data = (await res.json().catch(() => ({}))) as GitStatus & { message?: string };
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      pullRunning.value = false;
      pullStatus.value = "unauthorized — token cleared, try again";
      return;
    }
    if (!res.ok && res.status !== 202 && res.status !== 409) {
      pullRunning.value = false;
      pullStatus.value = data.message || `failed (${res.status})`;
      return;
    }
    pullStatus.value = data.message || "pull started";
    startPolling();
    await refreshGitStatus();
  } catch (err) {
    pullRunning.value = false;
    pullStatus.value = err instanceof Error ? err.message : "request failed";
  }
};

onMounted(() => {
  navigator?.storage?.persisted?.().then((res) => (persistence.value = res));
  if (gitPullEnabled) {
    void refreshGitStatus();
  }
});
onUnmounted(() => stopPolling());

const requestPersistence = async () => {
  const res = await navigator.storage.persist();
  persistence.value = res;
}

const appName = getAppName();
</script>
