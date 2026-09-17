<template>
  <section class="mt-4 mb-4">
    <v-container>
      <v-row>
        <v-col cols="12" md="8" offset-md="2" lg="6" offset-lg="3">
          <div class="landing-text-panel">
            <h2 class="text-h4 text-center mb-3">What is PawFeed?</h2>
            <p class="text-center">
              PawFeed is a personal, AI-assisted fork of
              <a
                class="text-primary text-decoration-underline"
                target="_blank"
                rel="noopener"
                href="https://github.com/avoonix/material-e621"
                >Material e621</a
              >.
              It browses e621, e6ai, Furbooru, Inkbunny, FurAffinity, Weasyl, Itaku, SoFurry,
              Tailspace{{ localBrowsePhrase }}, and Flayrah news. Federated date-merges the remote
              gallery children.
            </p>
            <p class="text-center">
              Uploads, site forums, and account admin stay on each origin site. Experimental —
              not affiliated with the sites or upstream. Follow each site’s rules, age
              requirements, and API terms. Source is AGPL-3.0 on
              <a
                class="text-primary text-decoration-underline"
                target="_blank"
                rel="noopener"
                href="https://github.com/lovelyspacedog/m-e621"
                >GitHub</a
              >.
            </p>
            <p class="text-center text-medium-emphasis text-body-2">
              For a stable e621-only client, use
              <a
                class="text-primary text-decoration-underline"
                target="_blank"
                rel="noopener"
                href="https://github.com/avoonix/material-e621"
                >upstream Material e621</a
              >
              or browse
              <a class="text-primary text-decoration-underline" target="_blank" rel="noopener" :href="url.e621Url"
                >e621.net</a
              >
              directly.
            </p>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUrlStore } from "@/services";
import { useSiteModeStore } from "@/services/SiteModeStore";

const url = useUrlStore();
const siteMode = useSiteModeStore();

const localBrowsePhrase = computed(() =>
  siteMode.supportsLocalMode ? ", and a local folder" : "",
);
</script>
