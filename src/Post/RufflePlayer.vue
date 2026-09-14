<template>
  <div ref="containerEl" class="ruffle-wrap">
    <div v-if="loading" class="ruffle-overlay">
      <app-logo type="loader" svg-margin-auto />
      <div class="text-caption mt-2 text-medium-emphasis">Loading Ruffle…</div>
    </div>
    <div v-if="error" class="ruffle-overlay ruffle-error">
      <v-icon size="48" color="warning">mdi-flash-alert</v-icon>
      <div class="text-caption mt-2 text-medium-emphasis">{{ error }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { ensureRuffle, type RufflePlayerElement } from '@/misc/util/ruffle';
import AppLogo from '@/App/AppLogo.vue';

const props = defineProps<{
  /** Raw (un-proxied) URL of the SWF file. */
  url: string | null | undefined;
}>();

const containerEl = ref<HTMLElement | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

let player: RufflePlayerElement | null = null;

/** Route the SWF through our same-origin download proxy so Ruffle can fetch it. */
const proxyUrl = (url: string) => `/api/download?url=${encodeURIComponent(url)}`;

const loadSwf = async (url: string) => {
  loading.value = true;
  error.value = null;
  try {
    const ruffle = await ensureRuffle();

    if (!player) {
      player = ruffle.createPlayer();
      player.style.width = '100%';
      player.style.height = '100%';
      containerEl.value?.appendChild(player);
    }

    await player.load({ url: proxyUrl(url), allowScriptAccess: 'never' });
    loading.value = false;
  } catch (e) {
    loading.value = false;
    error.value = e instanceof Error ? e.message : String(e);
    console.error('[RufflePlayer] load error', e);
  }
};

onMounted(() => {
  if (props.url) void loadSwf(props.url);
});

watch(
  () => props.url,
  (url) => {
    if (url) void loadSwf(url);
  },
);

onBeforeUnmount(() => {
  player?.remove();
  player = null;
});
</script>

<style scoped>
.ruffle-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.ruffle-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}

.ruffle-error {
  background: rgba(0, 0, 0, 0.6);
}
</style>
