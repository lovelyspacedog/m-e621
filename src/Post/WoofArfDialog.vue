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
        <!-- Mount iframe only while open so closing stops playback. -->
        <div v-if="modelValue" class="woof-arf-embed">
          <iframe
            class="woof-arf-embed__frame"
            src="https://www.youtube.com/embed/83m261lAlrs?autoplay=1&playsinline=1"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { computed, defineComponent } from "vue";
import { useDisplay } from "vuetify";

export default defineComponent({
  name: "WoofArfDialog",
  props: {
    modelValue: { type: Boolean, required: true },
  },
  emits: ["update:modelValue"],
  setup() {
    const { smAndDown } = useDisplay();
    const mobile = computed(() => smAndDown.value);
    return { mobile };
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
</style>
