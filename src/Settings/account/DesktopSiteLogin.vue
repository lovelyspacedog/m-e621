<template>
  <div v-if="available">
    <v-btn variant="text" color="accent" :loading="busy" @click="start">
      Sign in
    </v-btn>
    <p v-if="error" class="text-left text-caption text-error mb-0">{{ error }}</p>
    <p v-else-if="busy" class="text-left text-caption text-medium-emphasis mb-0">
      Finish signing in in the site window, then choose Use this session.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  desktopSignInAvailable,
  signInSite,
  type DesktopLoginSite,
  type DesktopSiteSession,
} from "@/misc/util/desktopLogin";

const props = defineProps<{
  site: DesktopLoginSite;
  loading?: boolean;
}>();

const emit = defineEmits<{
  session: [session: DesktopSiteSession];
}>();

const available = ref(false);
onMounted(() => {
  void desktopSignInAvailable().then((ok) => {
    available.value = ok;
  });
});
const working = ref(false);
const error = ref("");
const busy = computed(() => working.value || !!props.loading);

const start = async () => {
  error.value = "";
  working.value = true;
  try {
    const session = await signInSite(props.site);
    emit("session", session);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (!/cancel/i.test(message)) error.value = message;
  } finally {
    working.value = false;
  }
};
</script>
