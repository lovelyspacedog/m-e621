<template>
  <div class="profile-list-sync">
    <p class="text-caption text-medium-emphasis mb-2">
      {{ kindLabel }} are per site.
      Copy from another mode into the current one.
      <template v-if="kind === 'searches'">
        Same query language only (e621↔e6ai OK; cross-site refused).
        Merge keeps group names when possible.
      </template>
      <template v-else-if="kind === 'favorites'">
        Merge keeps starred-tag groups by name; Replace copies the full group tree.
      </template>
    </p>
    <div class="d-flex flex-wrap ga-2 align-center">
      <v-select
        v-model="fromMode"
        :items="sourceItems"
        item-title="title"
        item-value="value"
        label="From"
        density="compact"
        hide-details
        variant="outlined"
        style="min-width: 10rem; max-width: 14rem"
      />
      <v-btn
        variant="tonal"
        :disabled="!fromMode || busy"
        :loading="busy"
        @click="run('merge')"
      >
        Merge in
      </v-btn>
      <v-btn
        variant="text"
        color="warning"
        :disabled="!fromMode || busy"
        :loading="busy"
        @click="run('replace')"
      >
        Replace
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  useMainStore,
  useSiteModeStore,
  useSnackbarStore,
} from "@/services";
import type { SiteMode } from "@/services/types";
import { unifiedChildLabel } from "@/misc/util/postOrigin";
import {
  PROFILE_SYNC_MODES,
  canCopySavedSearches,
  copyProfileLists,
  type ProfileListKind,
} from "@/services/profileListSync";

const props = defineProps<{
  kind: ProfileListKind;
}>();

const main = useMainStore();
const siteMode = useSiteModeStore();
const snackbar = useSnackbarStore();
const fromMode = ref<SiteMode | null>(null);
const busy = ref(false);

const kindLabel = computed(() => {
  if (props.kind === "favorites") return "Starred tags";
  if (props.kind === "blacklist") return "Blacklist";
  return "Saved searches";
});

const sourceItems = computed(() =>
  PROFILE_SYNC_MODES.filter((m) => {
    if (m === siteMode.activeMode) return false;
    if (props.kind === "searches") {
      return canCopySavedSearches(m, siteMode.activeMode);
    }
    return true;
  }).map((m) => ({
    title: unifiedChildLabel(m),
    value: m,
  })),
);

const run = (mode: "merge" | "replace") => {
  if (!fromMode.value || busy.value) return;
  const from = fromMode.value;
  const to = siteMode.activeMode;
  if (mode === "replace") {
    const ok = window.confirm(
      `Replace this mode's ${kindLabel.value.toLowerCase()} with ${unifiedChildLabel(from)}'s?`,
    );
    if (!ok) return;
  }
  busy.value = true;
  try {
    const result = copyProfileLists(main.$state, {
      from,
      to,
      kind: props.kind,
      mode,
    });
    if (mode === "replace") {
      snackbar.addMessage(
        `Replaced with ${unifiedChildLabel(from)} (${result.total})`,
      );
    } else if (result.added === 0) {
      snackbar.addMessage(`Nothing new from ${unifiedChildLabel(from)}`);
    } else {
      snackbar.addMessage(
        `Merged ${result.added} from ${unifiedChildLabel(from)}`,
      );
    }
  } catch (e: any) {
    snackbar.addMessage(e?.message || String(e));
  } finally {
    busy.value = false;
  }
};
</script>
