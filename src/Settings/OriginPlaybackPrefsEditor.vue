<template>
  <div class="text-left">
    <p class="text-caption text-medium-emphasis mb-2">
      Optional mute / volume / speed for a site’s HTML5 media. Overrides globals and audio-kind
      prefs when set. SWF/Ruffle unchanged.
    </p>
    <div v-for="mode in originModes" :key="mode" class="mb-3">
      <div class="d-flex align-center ga-2 mb-1">
        <v-switch
          :model-value="isEnabled(mode)"
          color="accent"
          hide-details
          density="compact"
          class="flex-grow-0"
          @update:model-value="onToggle(mode, !!$event)"
        />
        <span class="text-body-2">{{ label(mode) }}</span>
      </div>
      <div v-if="isEnabled(mode)" class="pl-2">
        <v-switch
          :model-value="sliceMuted(mode)"
          label="Muted"
          color="accent"
          hide-details
          density="compact"
          class="mb-1"
          @update:model-value="setMuted(mode, !!$event)"
        />
        <v-slider
          color="accent"
          class="my-0"
          :model-value="sliceVolume(mode)"
          :disabled="sliceMuted(mode)"
          thumb-label
          :min="0"
          :max="1"
          :step="0.05"
          label="Volume"
          @update:model-value="setVolume(mode, Number($event))"
        />
        <v-select
          class="mt-2"
          variant="outlined"
          hide-details
          density="comfortable"
          label="Playback speed"
          :items="playbackRateItems"
          :model-value="sliceRate(mode)"
          @update:model-value="setRate(mode, Number($event))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  clearOriginPlaybackPrefs,
  ensureOriginPlaybackPrefs,
} from "@/misc/util/playbackPrefs";
import { unifiedChildLabel } from "@/misc/util/postOrigin";
import { useMainStore, usePostsStore } from "@/services";
import type { SiteMode } from "@/services/types";

const ORIGIN_PREF_MODES: SiteMode[] = [
  "e621",
  "e6ai",
  "furbooru",
  "inkbunny",
  "furaffinity",
  "weasyl",
  "itaku",
  "sofurry",
  "local",
  "tailspace",
];

const playbackRateItems = [
  { title: "0.5×", value: 0.5 },
  { title: "0.75×", value: 0.75 },
  { title: "1×", value: 1 },
  { title: "1.25×", value: 1.25 },
  { title: "1.5×", value: 1.5 },
  { title: "2×", value: 2 },
];

const main = useMainStore();
const posts = usePostsStore();
const originModes = ORIGIN_PREF_MODES;

const label = (mode: SiteMode) => unifiedChildLabel(mode);

const seed = () => ({
  volume: posts.videoVolume,
  muted: posts.videoMuted,
  playbackRate: posts.videoPlaybackRate || 1,
});

const isEnabled = (mode: SiteMode) =>
  Boolean(main.posts.playbackPrefs?.byOrigin?.[mode]);

const onToggle = (mode: SiteMode, enabled: boolean) => {
  if (enabled) ensureOriginPlaybackPrefs(main.posts, mode, seed());
  else clearOriginPlaybackPrefs(main.posts, mode);
};

const ensure = (mode: SiteMode) => ensureOriginPlaybackPrefs(main.posts, mode, seed());

const sliceMuted = (mode: SiteMode) =>
  main.posts.playbackPrefs?.byOrigin?.[mode]?.muted ?? posts.videoMuted;
const sliceVolume = (mode: SiteMode) =>
  main.posts.playbackPrefs?.byOrigin?.[mode]?.volume ?? posts.videoVolume;
const sliceRate = (mode: SiteMode) =>
  main.posts.playbackPrefs?.byOrigin?.[mode]?.playbackRate ??
  posts.videoPlaybackRate ??
  1;

const setMuted = (mode: SiteMode, value: boolean) => {
  ensure(mode);
  main.posts.playbackPrefs!.byOrigin![mode]!.muted = value;
};
const setVolume = (mode: SiteMode, value: number) => {
  ensure(mode);
  main.posts.playbackPrefs!.byOrigin![mode]!.volume = value;
};
const setRate = (mode: SiteMode, value: number) => {
  ensure(mode);
  main.posts.playbackPrefs!.byOrigin![mode]!.playbackRate = value;
};
</script>
