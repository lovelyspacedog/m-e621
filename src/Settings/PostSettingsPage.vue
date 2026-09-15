<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title section="posts" title="Post" color="brown-darken-3" />
        <settings-page-item title="Buttons" select>
          <post-button-editor :available-buttons="availableButtons" v-model:fullscreen-buttons="posts.fullscreenButtons"
            v-model:details-buttons="posts.detailsButtons" v-model:post-buttons="posts.buttons" />
        </settings-page-item>
        <settings-page-item title="Fullscreen arrow buttons" select>
          <v-select :items="fullscreenZoomUiModeItems" variant="outlined" hide-details
            v-model="posts.fullscreenZoomUiMode" />
        </settings-page-item>
        <settings-page-item title="Go fullscreen when viewing posts" switch>
          <v-switch v-model="posts.goFullscreen" />
        </settings-page-item>
        <settings-page-item title="Full-width post feed" switch
          description="Use the full content width for scrolling posts instead of the centered column. Ignored in grid layout.">
          <v-switch v-model="posts.fullWidthFeed" />
        </settings-page-item>
        <settings-page-item title="Grid layout" switch
          description="Dense thumbnail grid instead of the scrolling card list.">
          <v-switch
            :model-value="posts.feedLayout === 'grid'"
            @update:model-value="posts.feedLayout = $event ? 'grid' : 'list'"
          />
        </settings-page-item>
        <settings-page-item title="Compact cards" switch
          description="Hide tags and buttons until you hover the card (tap to expand on touch). When off, chrome stays visible in list and grid.">
          <v-switch v-model="posts.compactCards" />
        </settings-page-item>
        <settings-page-item title="Always collapse toolbar actions" switch
          description="Put Score / Favs / Random (and other posts toolbar actions) behind a ⋮ menu on all screen sizes. When off, they only collapse on narrow screens.">
          <v-switch v-model="posts.alwaysCollapseToolbar" />
        </settings-page-item>
        <settings-page-item title="Animate GIFs in feed" switch
          description="Load the full GIF so it moves in scrolling previews. Uses more data than still thumbs.">
          <v-switch v-model="posts.animateFeedGifs" />
        </settings-page-item>
        <settings-page-item title="Autoplay video in feed" switch
          description="Play videos while on screen. Off-screen cards drop their buffers so a long feed does not keep every video loaded.">
          <v-switch v-model="posts.autoplayFeedVideo" />
        </settings-page-item>
        <settings-page-item title="Autoplay silently" switch
          description="Mute feed autoplay so browsers allow it. Fullscreen mute/volume stays separate.">
          <v-switch
            v-model="posts.autoplayFeedVideoSilent"
            :disabled="!posts.autoplayFeedVideo"
          />
        </settings-page-item>
        <settings-page-item title="Video volume" select
          description="Remembered for feed cards and fullscreen. Default muted helps autoplay.">
          <v-switch v-model="posts.videoMuted" label="Muted" class="mb-2" />
          <v-slider
            color="accent"
            class="my-0 mx-3"
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
            label="Playback speed"
            :items="playbackRateItems"
            v-model="posts.videoPlaybackRate"
          />
        </settings-page-item>
        <settings-page-item title="Slideshow interval" select
          description="Seconds between images while slideshow is playing. Videos wait until they finish.">
          <v-slider
            color="accent"
            class="my-0 mx-3"
            :model-value="slideshowIntervalSeconds"
            @update:model-value="onSlideshowIntervalSeconds"
            thumb-label
            :min="3"
            :max="60"
            :step="1"
            label="Seconds per image"
          />
        </settings-page-item>
        <settings-page-item title="Card auto-next" switch
          description="Automatically scroll the feed to the next post. Videos wait until they finish.">
          <v-switch v-model="posts.cardAutoNext" />
        </settings-page-item>
        <settings-page-item title="Card auto-next interval" select
          description="Seconds to stay on each image card. Videos wait until they finish.">
          <v-slider
            color="accent"
            class="my-0 mx-3"
            :model-value="cardAutoNextIntervalSeconds"
            @update:model-value="onCardAutoNextIntervalSeconds"
            thumb-label
            :min="3"
            :max="60"
            :step="1"
            label="Seconds per card"
          />
        </settings-page-item>
        <settings-page-item title="Limits" select>
          <v-slider color="accent" class="my-0 mx-3" v-model="posts.postListFetchLimit" thumb-label :min="10" :max="320"
            label="Posts per page" />
          <v-slider color="accent" class="my-0 mx-3" v-model="posts.tagFetchLimit" thumb-label :min="10" :max="500"
            label="Tags" />
          <v-slider color="accent" class="my-0 mx-3" v-model="posts.sidebarSuggestionLimit" thumb-label :min="0"
            :max="500" label="Suggestions (sidebar)" />
        </settings-page-item>
        <settings-page-item title="Data saver" select
          description="Viewing posts in fullscreen will still show highest-quality images.">
          <template #description>
            <v-expand-transition>
              <automatic-data-saver-info v-if="showAutomaticDataSaverInfo" />
            </v-expand-transition>
          </template>
          <v-select :items="dataSaverItems" variant="outlined" hide-details v-model="posts.dataSaver" />
        </settings-page-item>
        <settings-page-item title="Lazy load images" switch
          description="Load images as you scroll past them, instead of all at once.">
          <v-switch v-model="posts.lazyLoad" />
        </settings-page-item>
        <settings-page-item title="Auto load next page" switch>
          <v-switch v-model="posts.autoLoad" />
        </settings-page-item>
        <settings-page-item title="Save locally" select
          :description="saveLocallyDescription">
          <v-text-field
            class="mb-2"
            variant="outlined"
            hide-details="auto"
            label="Path template"
            v-model="posts.saveLocalPathTemplate"
            hint="%artist%  %tags 1-5% (2 species + 3 tags)  %ext%  %id%"
            persistent-hint
          />
          <local-folder-picker v-if="supportsLocalMode" purpose="save" />
        </settings-page-item>
        <settings-page-item
          v-if="supportsLocalMode"
          title="Local browse folder"
          select
          description="Folder Local mode reads for images and videos. Separate from Save Locally."
        >
          <local-folder-picker purpose="local" />
        </settings-page-item>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { usePostsStore, useSiteModeStore } from "@/services";
import { DataSaverType, FullscreenZoomUiMode } from "@/services/types";
import { computed } from "vue";
import AutomaticDataSaverInfo from "./AutomaticDataSaverInfo.vue";
import LocalFolderPicker from "./LocalFolderPicker.vue";
import PostButtonEditor from "./PostButtonEditor.vue";
import SettingsPageItem from "./SettingsPageItem.vue";
import SettingsPageTitle from "./SettingsPageTitle.vue";
import { useHead } from "@unhead/vue";

useHead({
  title: "Post Settings",
});

const posts = usePostsStore();
const siteMode = useSiteModeStore();
const supportsLocalMode = computed(() => siteMode.supportsLocalMode);
const saveLocallyDescription = computed(() =>
  supportsLocalMode.value
    ? "Chromium can write into a chosen folder with subfolders. Folder grant is not included in settings export/restore."
    : "This browser downloads files with a flattened filename. Choosing a save folder needs Chromium (File System Access API).",
);
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

</script>
