<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="toastEl"
      class="tip-toast"
      role="status"
      aria-live="polite"
    >
      <v-sheet color="secondary" elevation="8" class="tip-toast__sheet pa-4">
        <div class="d-flex align-center mb-2">
          <v-icon class="mr-2">mdi-information-outline</v-icon>
          <span class="text-subtitle-1 font-weight-medium">{{ title }}</span>
        </div>
        <div class="tip-toast__body text-body-2">
          <slot />
        </div>
        <v-checkbox
          v-model="dontShowAgain"
          class="mt-3"
          color="accent"
          density="compact"
          hide-details
          label="Don't show this again"
        />
        <div class="d-flex justify-end mt-2">
          <v-btn color="accent" variant="flat" @click="close">OK</v-btn>
        </div>
      </v-sheet>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useAppearanceStore, useTipQueueStore } from "@/services";

const props = defineProps<{
  tipId: string;
  title: string;
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const appearance = useAppearanceStore();
const tipQueue = useTipQueueStore();
const dontShowAgain = ref(false);
const toastEl = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

const visible = computed(
  () => props.modelValue && tipQueue.activeTipId === props.tipId,
);

const measure = () => {
  const el = toastEl.value;
  if (!el) return;
  tipQueue.setActiveHeight(props.tipId, el.getBoundingClientRect().height);
};

const attachObserver = async () => {
  await nextTick();
  detachObserver();
  const el = toastEl.value;
  if (!el || typeof ResizeObserver === "undefined") {
    measure();
    return;
  }
  resizeObserver = new ResizeObserver(() => measure());
  resizeObserver.observe(el);
  measure();
};

const detachObserver = () => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  tipQueue.clearActiveHeight(props.tipId);
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      tipQueue.enqueue(props.tipId);
    } else {
      tipQueue.remove(props.tipId);
    }
  },
  { immediate: true },
);

watch(visible, (show) => {
  if (show) {
    dontShowAgain.value = false;
    void attachObserver();
  } else {
    detachObserver();
  }
});

const close = () => {
  if (dontShowAgain.value) {
    appearance.dismissTip(props.tipId);
  }
  tipQueue.remove(props.tipId);
  emit("update:modelValue", false);
};

onBeforeUnmount(() => {
  detachObserver();
  tipQueue.remove(props.tipId);
});
</script>

<style scoped>
.tip-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2400;
  max-width: min(420px, calc(100vw - 32px));
  pointer-events: auto;
}

.tip-toast__sheet {
  border-radius: 8px;
}

.tip-toast__body :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
