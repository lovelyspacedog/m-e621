<template>
  <v-dialog
    :model-value="modelValue"
    :fullscreen="mobile"
    :max-width="mobile ? undefined : 800"
    scrim="primary"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card
      color="secondary"
      class="woof-arf-card"
      :class="{ 'woof-arf-card--mobile': mobile }"
    >
      <v-card-title class="d-flex align-center py-1 woof-arf-title">
        <v-spacer />
        <v-btn
          icon
          variant="text"
          aria-label="Close"
          @click="$emit('update:modelValue', false)"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text class="pt-0 woof-arf-body">
        <!--
          PawDeck serves COEP: credentialless (SharedArrayBuffer / ffmpeg.wasm).
          YouTube embeds need a credentialless iframe (Chromium) or they refuse
          to connect. Set credentialless before src; tear down on close.
        -->
        <div v-if="modelValue" class="woof-arf-embed">
          <iframe
            v-if="supportsCredentialless"
            :ref="bindCredentiallessFrame"
            class="woof-arf-embed__frame"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          />
          <div v-else class="woof-arf-fallback">
            <a
              class="text-primary text-decoration-underline"
              :href="WATCH_URL"
              target="_blank"
              rel="noopener"
            >
              Continue
            </a>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { computed, defineComponent } from "vue";
import { useDisplay } from "vuetify";

const VIDEO_ID = "83m261lAlrs";
const EMBED_URL = `https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&playsinline=1`;
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

const supportsCredentialless =
  typeof HTMLIFrameElement !== "undefined" &&
  "credentialless" in HTMLIFrameElement.prototype;

/** Must set credentialless before src under COEP, or YouTube refuses to connect. */
const bindCredentiallessFrame = (el: Element | null) => {
  if (!(el instanceof HTMLIFrameElement)) return;
  el.credentialless = true;
  if (el.getAttribute("src") !== EMBED_URL) {
    el.src = EMBED_URL;
  }
};

export default defineComponent({
  name: "WoofArfDialog",
  props: {
    modelValue: { type: Boolean, required: true },
  },
  emits: ["update:modelValue"],
  setup() {
    const { smAndDown } = useDisplay();
    const mobile = computed(() => smAndDown.value);
    return {
      mobile,
      supportsCredentialless,
      bindCredentiallessFrame,
      WATCH_URL,
    };
  },
});
</script>

<style scoped>
.woof-arf-card--mobile {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100dvh;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

.woof-arf-title {
  flex: 0 0 auto;
}

.woof-arf-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.woof-arf-embed {
  position: relative;
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  /* Keep 16:9 inside short / landscape phone viewports (chrome + title bar). */
  max-height: min(
    56.25vw,
    calc(
      100dvh - 4.5rem - env(safe-area-inset-top, 0px) -
        env(safe-area-inset-bottom, 0px)
    )
  );
  background: #000;
  overflow: hidden;
}

.woof-arf-card--mobile .woof-arf-embed {
  width: min(
    100%,
    calc(
      (
          100dvh - 4.5rem - env(safe-area-inset-top, 0px) -
            env(safe-area-inset-bottom, 0px)
        ) * 16 / 9
    )
  );
  max-height: calc(
    100dvh - 4.5rem - env(safe-area-inset-top, 0px) -
      env(safe-area-inset-bottom, 0px)
  );
}

.woof-arf-embed__frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.woof-arf-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--v-theme-secondary));
}
</style>
