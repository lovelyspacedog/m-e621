<template>
  <v-footer class="bg-primary py-4">
    <v-container class="py-0">
      <div class="d-flex flex-wrap align-center justify-space-between ga-3">
        <div class="text-white text-body-2">
          PawDeck by Tony Pup · forked from
          <a href="https://github.com/avoonix/material-e621" class="text-white text-decoration-underline" title="Material e621"
            >Material e621</a
          >
          by
          <a href="https://avoonix.com/" class="text-white text-decoration-underline" title="Avoonix">Avoo</a>
        </div>
        <div class="d-flex align-center ga-1">
          <v-btn
            size="small"
            variant="text"
            color="white"
            class="text-none"
            @click="emit('open-info')"
          >
            Info
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            color="white"
            aria-label="Settings"
            @click="emit('open-settings')"
          >
            <v-icon>mdi-cog</v-icon>
          </v-btn>
        </div>
      </div>
      <div class="text-white text-caption mt-2" style="opacity: 0.9">
        Source:
        <a
          href="https://github.com/lovelyspacedog/m-e621"
          class="text-white text-decoration-underline"
          target="_blank"
          rel="noopener"
          >GitHub (AGPL-3.0)</a
        >
        · Adult content; follow each site’s age requirements and terms. Not affiliated with the
        supported sites or upstream maintainers.
      </div>
    </v-container>
  </v-footer>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  "open-info": [];
  "open-settings": [];
}>();
</script>
