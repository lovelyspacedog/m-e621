<template>
  <v-menu location="bottom left" close-delay="0">
    <template #activator="{ props }">
      <v-btn v-show="showInstallPrompt" v-bind="props" icon>
        <v-badge color="primary" floating location="left">
          <template #badge>
            <v-icon>mdi-exclamation-thick</v-icon>
          </template>
          <v-icon>mdi-download</v-icon>
        </v-badge>
      </v-btn>
    </template>
    <v-card max-width="400">
      <v-card-text>
        You are using a browser that supports installing progressive web apps.
        After installing, a shortcut will be added to your app drawer and the
        app will be launched as standalone window/app.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="hide">Never show again</v-btn>
        <v-btn variant="text" color="primary" @click="install">Install</v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<script lang="ts">
import { useAppearanceStore } from "@/services";
import { computed, defineComponent, ref } from "vue";

interface BeforeInstallPromptEvent extends Event {
  prompt(): void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);

window.addEventListener("beforeinstallprompt", (e: Event) => {
  e.preventDefault();
  deferredPrompt.value = e as BeforeInstallPromptEvent;
});

export default defineComponent({
  setup() {
    const appearance = useAppearanceStore();
    const showInstallPrompt = computed(
      () => !!deferredPrompt.value && !appearance.hideInstallPrompt,
    );

    const hide = () => {
      appearance.hideInstallPrompt = true;
    };
    const install = async () => {
      if (!deferredPrompt.value) return;
      deferredPrompt.value.prompt();
      const choiceResult = await deferredPrompt.value.userChoice;
      if (choiceResult.outcome === "accepted") {
        // TODO
        console.log("User accepted the A2HS prompt");
        await navigator?.storage?.persist();
      } else {
        console.log("User dismissed the A2HS prompt");
      }
      deferredPrompt.value = null;
    };

    return {
      showInstallPrompt,
      hide,
      install,
    };
  },
});
</script>
