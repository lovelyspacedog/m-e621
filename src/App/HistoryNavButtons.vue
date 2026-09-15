<template>
  <div class="history-nav d-flex flex-nowrap">
    <v-btn
      icon
      size="small"
      title="Back"
      :disabled="!canGoBack"
      @click="goBack"
    >
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-btn
      icon
      size="small"
      title="Forward"
      :disabled="!canGoForward"
      @click="goForward"
    >
      <v-icon>mdi-arrow-right</v-icon>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

type VueHistoryState = {
  back?: unknown | null;
  forward?: unknown | null;
};

const router = useRouter();
const canGoBack = ref(false);
const canGoForward = ref(false);

const update = () => {
  const state = window.history.state as VueHistoryState | null;
  canGoBack.value = state?.back != null;
  canGoForward.value = state?.forward != null;
};

const goBack = () => {
  if (!canGoBack.value) return;
  router.back();
};

const goForward = () => {
  if (!canGoForward.value) return;
  router.forward();
};

const stopAfterEach = router.afterEach(() => {
  nextTick(update);
});

onMounted(() => {
  update();
  window.addEventListener("popstate", update);
});

onUnmounted(() => {
  stopAfterEach();
  window.removeEventListener("popstate", update);
});
</script>
