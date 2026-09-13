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
          description="Use the full content width for scrolling posts instead of the centered column.">
          <v-switch v-model="posts.fullWidthFeed" />
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
          description="Chromium can write into a chosen folder with subfolders. Firefox/Zen fall back to Downloads with a flattened filename. Folder grant is not included in settings export/restore.">
          <v-text-field
            class="mb-2"
            variant="outlined"
            hide-details="auto"
            label="Path template"
            v-model="posts.saveLocalPathTemplate"
            hint="%artist%  %tags 1-5% (2 species + 3 tags)  %ext%  %id%"
            persistent-hint
          />
          <local-folder-picker />
        </settings-page-item>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { usePostsStore } from "@/services";
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
const availableButtons = computed(() => posts.allButtonTypes);
const slideshowIntervalSeconds = computed(() =>
  Math.round(posts.slideshowIntervalMs / 1000),
);
const onSlideshowIntervalSeconds = (value: number | number[]) => {
  const seconds = Array.isArray(value) ? value[0] : value;
  posts.slideshowIntervalMs = Math.round(seconds) * 1000;
};

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
