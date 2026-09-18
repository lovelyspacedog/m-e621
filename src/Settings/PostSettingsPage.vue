<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title
          section="posts"
          title="Post"
          color="brown-darken-3"
          :chips="navChips"
        />

        <settings-group title="Buttons & fullscreen" anchor="buttons">
          <settings-row title="Buttons" stack>
            <post-button-editor
              :available-buttons="availableButtons"
              v-model:fullscreen-buttons="posts.fullscreenButtons"
              v-model:details-buttons="posts.detailsButtons"
              v-model:post-buttons="posts.buttons"
            />
          </settings-row>
          <settings-row title="Fullscreen arrow buttons" stack>
            <v-select
              :items="fullscreenZoomUiModeItems"
              variant="outlined"
              hide-details
              density="comfortable"
              v-model="posts.fullscreenZoomUiMode"
            />
          </settings-row>
          <settings-row title="Go fullscreen when viewing posts" switch>
            <v-switch v-model="posts.goFullscreen" color="accent" hide-details density="compact" />
          </settings-row>
        </settings-group>

        <settings-group title="Feed layout" anchor="layout">
          <settings-row
            title="SFW only (safe rating)"
            description="Forces safe rating on every site that supports it, overrides rating search tags, and hides non-safe posts in list feeds. Direct post links still open."
            switch
          >
            <v-switch v-model="posts.sfwOnly" color="accent" hide-details density="compact" />
          </settings-row>
          <settings-row
            title="Full-width post feed"
            description="Use the full content width for scrolling posts instead of the centered column. Ignored in grid layout."
            switch
          >
            <v-switch v-model="posts.fullWidthFeed" color="accent" hide-details density="compact" />
          </settings-row>
          <settings-row
            title="Grid layout"
            description="Dense thumbnail grid instead of the scrolling card list."
            switch
          >
            <v-switch
              :model-value="posts.feedLayout === 'grid'"
              color="accent"
              hide-details
              density="compact"
              @update:model-value="posts.feedLayout = $event ? 'grid' : 'list'"
            />
          </settings-row>
          <settings-row
            title="Compact cards"
            description="Hide tags and buttons until you hover the card (tap to expand on touch). When off, chrome stays visible in list and grid."
            switch
          >
            <v-switch v-model="posts.compactCards" color="accent" hide-details density="compact" />
          </settings-row>
          <settings-row
            title="Always collapse toolbar actions"
            description="Put Score / Favs / Random (and other posts toolbar actions) behind a ⋮ menu on all screen sizes. When off, they only collapse on narrow screens."
            switch
          >
            <v-switch
              v-model="posts.alwaysCollapseToolbar"
              color="accent"
              hide-details
              density="compact"
            />
          </settings-row>
          <settings-row
            title="Infinite scroll"
            description="Automatically load the next and previous pages as you scroll. When off, use the previous/next page buttons."
            switch
          >
            <v-switch v-model="posts.autoLoad" color="accent" hide-details density="compact" />
          </settings-row>
        </settings-group>

        <settings-group title="Media" anchor="media">
          <settings-row
            title="Animate GIFs in feed"
            description="Load the full GIF so it moves in scrolling previews. Uses more data than still thumbs."
            switch
          >
            <v-switch v-model="posts.animateFeedGifs" color="accent" hide-details density="compact" />
          </settings-row>
          <settings-row
            title="Autoplay video in feed"
            description="Play videos while on screen. Off-screen cards drop their buffers so a long feed does not keep every video loaded."
            switch
          >
            <v-switch
              v-model="posts.autoplayFeedVideo"
              color="accent"
              hide-details
              density="compact"
            />
          </settings-row>
          <settings-row
            title="Autoplay silently"
            description="Mute feed autoplay so browsers allow it. Fullscreen mute/volume stays separate."
            switch
          >
            <v-switch
              v-model="posts.autoplayFeedVideoSilent"
              :disabled="!posts.autoplayFeedVideo"
              color="accent"
              hide-details
              density="compact"
            />
          </settings-row>
          <settings-row
            title="Video volume"
            description="Remembered for feed cards and fullscreen. Default muted helps autoplay. Audio can use separate overrides below."
            stack
          >
            <v-switch
              v-model="posts.videoMuted"
              label="Muted"
              color="accent"
              hide-details
              density="compact"
              class="mb-2"
            />
            <v-slider
              color="accent"
              class="my-0"
              v-model="posts.videoVolume"
              :disabled="posts.videoMuted"
              thumb-label
              :min="0"
              :max="1"
              :step="0.05"
              label="Volume"
            />
            <v-select
              class="mt-2"
              variant="outlined"
              hide-details
              density="comfortable"
              label="Playback speed"
              :items="playbackRateItems"
              v-model="posts.videoPlaybackRate"
            />
          </settings-row>
          <settings-row
            title="Separate audio prefs"
            description="Music posts (FurAffinity, Weasyl, SoFurry, Local audio) use their own mute/volume/speed. Off = same as video globals. SWF/Ruffle unchanged."
            switch
          >
            <v-switch
              :model-value="audioPrefsEnabled"
              @update:model-value="onAudioPrefsEnabled"
              color="accent"
              hide-details
              density="compact"
            />
          </settings-row>
          <settings-row
            v-if="audioPrefsEnabled"
            title="Audio volume"
            stack
          >
            <v-switch
              v-model="audioMuted"
              label="Muted"
              color="accent"
              hide-details
              density="compact"
              class="mb-2"
            />
            <v-slider
              color="accent"
              class="my-0"
              v-model="audioVolume"
              :disabled="audioMuted"
              thumb-label
              :min="0"
              :max="1"
              :step="0.05"
              label="Volume"
            />
            <v-select
              class="mt-2"
              variant="outlined"
              hide-details
              density="comfortable"
              label="Playback speed"
              :items="playbackRateItems"
              v-model="audioPlaybackRate"
            />
          </settings-row>
          <settings-row title="Per-site playback overrides" stack>
            <origin-playback-prefs-editor />
          </settings-row>
        </settings-group>

        <settings-group title="Slideshow" anchor="slideshow">
          <settings-row
            title="Slideshow interval"
            description="Seconds between images while slideshow is playing. Videos wait until they finish."
            stack
          >
            <v-slider
              color="accent"
              class="my-0"
              :model-value="slideshowIntervalSeconds"
              @update:model-value="onSlideshowIntervalSeconds"
              thumb-label
              :min="3"
              :max="60"
              :step="1"
              label="Seconds per image"
            />
          </settings-row>
          <settings-row
            title="Card auto-next"
            description="Automatically scroll the feed to the next post. Videos wait until they finish."
            switch
          >
            <v-switch v-model="posts.cardAutoNext" color="accent" hide-details density="compact" />
          </settings-row>
          <settings-row
            title="Card auto-next interval"
            description="Seconds to stay on each image card. Videos wait until they finish."
            stack
          >
            <v-slider
              color="accent"
              class="my-0"
              :model-value="cardAutoNextIntervalSeconds"
              @update:model-value="onCardAutoNextIntervalSeconds"
              thumb-label
              :min="3"
              :max="60"
              :step="1"
              label="Seconds per card"
            />
          </settings-row>
        </settings-group>

        <settings-group title="Loading & data" anchor="loading">
          <settings-row title="Limits" stack>
            <v-slider
              color="accent"
              class="my-0"
              v-model="posts.postListFetchLimit"
              thumb-label
              :min="10"
              :max="320"
              label="Posts per page"
            />
            <v-slider
              color="accent"
              class="my-0"
              v-model="posts.tagFetchLimit"
              thumb-label
              :min="10"
              :max="500"
              label="Tags"
            />
            <v-slider
              color="accent"
              class="my-0"
              v-model="posts.sidebarSuggestionLimit"
              thumb-label
              :min="0"
              :max="500"
              label="Suggestions (sidebar)"
            />
          </settings-row>
          <settings-row
            title="Data saver"
            description="Viewing posts in fullscreen will still show highest-quality images."
            stack
          >
            <automatic-data-saver-info v-if="showAutomaticDataSaverInfo" class="mb-2" />
            <v-select
              :items="dataSaverItems"
              variant="outlined"
              hide-details
              density="comfortable"
              v-model="posts.dataSaver"
            />
          </settings-row>
          <settings-row
            title="Lazy load images"
            description="Load images as you scroll past them, instead of all at once."
            switch
          >
            <v-switch v-model="posts.lazyLoad" color="accent" hide-details density="compact" />
          </settings-row>
        </settings-group>

        <settings-group title="Save & Local" anchor="local">
          <settings-row title="Save locally" :description="saveLocallyDescription" stack>
            <v-text-field
              class="mb-2"
              variant="outlined"
              hide-details="auto"
              density="comfortable"
              label="Path template"
              v-model="posts.saveLocalPathTemplate"
              hint="Collision → foo (1).ext"
              persistent-hint
            />
            <div class="d-flex flex-wrap ga-1 mb-2">
              <v-chip
                v-for="token in pathTemplateTokens"
                :key="token"
                size="small"
                label
                variant="tonal"
                color="accent"
                @click="insertPathToken(token)"
              >
                {{ token }}
              </v-chip>
            </div>
            <local-folder-picker v-if="supportsLocalMode" purpose="save" />
            <v-switch
              v-if="supportsLocalMode"
              class="mt-2"
              hide-details
              color="accent"
              density="compact"
              label="Open in Local after save"
              v-model="posts.openInLocalAfterSave"
            />
          </settings-row>
          <settings-row
            v-if="supportsLocalMode"
            title="Local browse folder"
            description="Folder Local mode reads for images and videos. Separate from Save Locally."
            stack
          >
            <local-folder-picker purpose="local" />
          </settings-row>
        </settings-group>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { useMainStore, usePostsStore, useSiteModeStore } from "@/services";
import { DataSaverType, FullscreenZoomUiMode } from "@/services/types";
import {
  clearKindPlaybackPrefs,
  ensureKindPlaybackPrefs,
} from "@/misc/util/playbackPrefs";
import { computed } from "vue";
import AutomaticDataSaverInfo from "./AutomaticDataSaverInfo.vue";
import LocalFolderPicker from "./LocalFolderPicker.vue";
import OriginPlaybackPrefsEditor from "./OriginPlaybackPrefsEditor.vue";
import PostButtonEditor from "./PostButtonEditor.vue";
import SettingsGroup from "./SettingsGroup.vue";
import SettingsPageTitle, { type SettingsNavChip } from "./SettingsPageTitle.vue";
import SettingsRow from "./SettingsRow.vue";
import { useHead } from "@unhead/vue";

useHead({
  title: "Post Settings",
});

const posts = usePostsStore();
const main = useMainStore();
const siteMode = useSiteModeStore();
const supportsLocalMode = computed(() => siteMode.supportsLocalMode);
const saveLocallyDescription = computed(() =>
  supportsLocalMode.value
    ? "Chromium can write into a chosen folder with subfolders. Folder grant is not included in settings export/restore."
    : "This browser downloads files with a flattened filename. Choosing a save folder needs Chromium (File System Access API).",
);

const audioPrefsEnabled = computed(
  () => Boolean(main.posts.playbackPrefs?.byKind?.audio),
);
const onAudioPrefsEnabled = (enabled: boolean | null) => {
  if (enabled == null) return;
  if (enabled) {
    ensureKindPlaybackPrefs(main.posts, "audio", {
      volume: posts.videoVolume,
      muted: posts.videoMuted,
      playbackRate: posts.videoPlaybackRate || 1,
    });
  } else {
    clearKindPlaybackPrefs(main.posts, "audio");
  }
};
const audioMuted = computed({
  get() {
    return main.posts.playbackPrefs?.byKind?.audio?.muted ?? posts.videoMuted;
  },
  set(value: boolean) {
    ensureKindPlaybackPrefs(main.posts, "audio", {
      volume: posts.videoVolume,
      muted: posts.videoMuted,
      playbackRate: posts.videoPlaybackRate || 1,
    });
    main.posts.playbackPrefs!.byKind!.audio!.muted = value;
  },
});
const audioVolume = computed({
  get() {
    return main.posts.playbackPrefs?.byKind?.audio?.volume ?? posts.videoVolume;
  },
  set(value: number) {
    ensureKindPlaybackPrefs(main.posts, "audio", {
      volume: posts.videoVolume,
      muted: posts.videoMuted,
      playbackRate: posts.videoPlaybackRate || 1,
    });
    main.posts.playbackPrefs!.byKind!.audio!.volume = value;
  },
});
const audioPlaybackRate = computed({
  get() {
    return (
      main.posts.playbackPrefs?.byKind?.audio?.playbackRate ??
      posts.videoPlaybackRate ??
      1
    );
  },
  set(value: number) {
    ensureKindPlaybackPrefs(main.posts, "audio", {
      volume: posts.videoVolume,
      muted: posts.videoMuted,
      playbackRate: posts.videoPlaybackRate || 1,
    });
    main.posts.playbackPrefs!.byKind!.audio!.playbackRate = value;
  },
});

const navChips = computed<SettingsNavChip[]>(() => {
  const chips: SettingsNavChip[] = [
    { label: "Buttons", anchor: "buttons" },
    { label: "Layout", anchor: "layout" },
    { label: "Media", anchor: "media" },
    { label: "Slideshow", anchor: "slideshow" },
    { label: "Loading", anchor: "loading" },
  ];
  if (supportsLocalMode.value) {
    chips.push({ label: "Local", anchor: "local" });
  } else {
    chips.push({ label: "Save", anchor: "local" });
  }
  return chips;
});

const availableButtons = computed(() => posts.allButtonTypes);
const slideshowIntervalSeconds = computed(() =>
  Math.round(posts.slideshowIntervalMs / 1000),
);
const onSlideshowIntervalSeconds = (value: number | number[]) => {
  const seconds = Array.isArray(value) ? value[0] : value;
  posts.slideshowIntervalMs = Math.round(seconds) * 1000;
};
const cardAutoNextIntervalSeconds = computed(() =>
  Math.round(posts.cardAutoNextIntervalMs / 1000),
);
const onCardAutoNextIntervalSeconds = (value: number | number[]) => {
  const seconds = Array.isArray(value) ? value[0] : value;
  posts.cardAutoNextIntervalMs = Math.round(seconds) * 1000;
};

const playbackRateItems = [
  { title: "0.5×", value: 0.5 },
  { title: "0.75×", value: 0.75 },
  { title: "1×", value: 1 },
  { title: "1.25×", value: 1.25 },
  { title: "1.5×", value: 1.5 },
  { title: "2×", value: 2 },
];

const fullscreenZoomUiModeItems = computed(() => [
  {
    title: "Always hide",
    value: FullscreenZoomUiMode.alwaysHide,
  },
  {
    title: "Always show",
    value: FullscreenZoomUiMode.neverHide,
  },
  {
    title: "Hide while zoomed in",
    value: FullscreenZoomUiMode.hideWhileZoomed,
  },
]);

const dataSaverItems = computed(() => [
  {
    title: "Automatic",
    value: DataSaverType.auto,
  },
  {
    title: "Highest quality previews",
    value: DataSaverType.highest,
  },
  {
    title: "Medium quality previews",
    value: DataSaverType.medium,
  },
  {
    title: "Lowest quality previews",
    value: DataSaverType.lowest,
  },
]);

const showAutomaticDataSaverInfo = computed(
  () => posts.dataSaver === DataSaverType.auto,
);

const pathTemplateTokens = [
  "%artist%",
  "%tags 1-5%",
  "%ext%",
  "%id%",
  "%origin%",
];

const insertPathToken = (token: string) => {
  const current = posts.saveLocalPathTemplate || "";
  if (!current) {
    posts.saveLocalPathTemplate = token;
    return;
  }
  if (token === "%ext%") {
    if (current.includes("%ext%")) return;
    posts.saveLocalPathTemplate = `${current.replace(/\.[^./]*$/, "")}${token}`;
    return;
  }
  if (current.endsWith("/") || current.endsWith("%")) {
    posts.saveLocalPathTemplate = `${current}${current.endsWith("%") ? "/" : ""}${token}`;
    return;
  }
  posts.saveLocalPathTemplate = `${current}/${token}`;
};
</script>
