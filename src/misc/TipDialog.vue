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
        <div class="tip-toast__header d-flex align-center mb-2">
          <v-icon class="mr-2 flex-shrink-0">mdi-information-outline</v-icon>
          <span class="text-subtitle-1 font-weight-medium tip-toast__title">{{
            title
          }}</span>
        </div>
        <div class="tip-toast__body text-body-2">
          <slot />
        </div>
        <v-checkbox
          v-model="dontShowAgain"
          class="mt-3 tip-toast__checkbox"
          color="accent"
          density="comfortable"
          hide-details
          label="Don't show this again"
        />
        <div class="tip-toast__actions d-flex justify-end mt-2">
          <v-btn
            color="accent"
            variant="flat"
            class="tip-toast__ok"
            @click="close"
          >
            OK
          </v-btn>
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

const PAD = 12;

const visible = computed(
  () => props.modelValue && tipQueue.activeTipId === props.tipId,
);

/** Snackbar clearance: visual-viewport bottom → tip top + gap. */
const measure = () => {
  const el = toastEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const clearance = Math.max(0, viewBottom - rect.top) + 8;
  tipQueue.setActiveHeight(props.tipId, clearance);
};

/**
 * Pin the toast to the *visual* viewport. Layout viewport can be taller/wider
 * than what the user sees (mobile chrome, soft keyboard, some embeddings).
 */
const syncVisualViewport = () => {
  const el = toastEl.value;
  if (!el) return;

  const vv = window.visualViewport;
  if (!vv) {
    el.style.bottom = "";
    el.style.left = "";
    el.style.right = "";
    el.style.maxWidth = "";
    el.style.maxHeight = "";
    measure();
    return;
  }

  const bottomInset = Math.max(
    0,
    window.innerHeight - vv.offsetTop - vv.height,
  );
  const rightInset = Math.max(0, window.innerWidth - vv.offsetLeft - vv.width);
  el.style.bottom = `calc(${bottomInset}px + max(${PAD}px, env(safe-area-inset-bottom, 0px)))`;
  el.style.right = `calc(${rightInset}px + max(${PAD}px, env(safe-area-inset-right, 0px)))`;
  el.style.maxHeight = `${Math.min(vv.height * 0.7, vv.height - PAD * 2)}px`;

  if (vv.width < 600) {
    el.style.left = `calc(${vv.offsetLeft}px + max(${PAD}px, env(safe-area-inset-left, 0px)))`;
    el.style.maxWidth = "none";
    el.classList.add("tip-toast--narrow");
  } else {
    el.style.left = "";
    el.style.maxWidth = `${Math.min(420, vv.width - PAD * 2)}px`;
    el.classList.remove("tip-toast--narrow");
  }

  measure();
};

const attachObserver = async () => {
  await nextTick();
  detachObserver();
  const el = toastEl.value;
  if (!el) return;

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => syncVisualViewport());
    resizeObserver.observe(el);
  }
  window.addEventListener("resize", syncVisualViewport);
  window.addEventListener("orientationchange", syncVisualViewport);
  window.visualViewport?.addEventListener("resize", syncVisualViewport);
  window.visualViewport?.addEventListener("scroll", syncVisualViewport);
  syncVisualViewport();
};

const clearInlineGeometry = () => {
  const el = toastEl.value;
  if (!el) return;
  el.style.bottom = "";
  el.style.left = "";
  el.style.right = "";
  el.style.maxWidth = "";
  el.style.maxHeight = "";
  el.classList.remove("tip-toast--narrow");
};

const detachObserver = () => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("resize", syncVisualViewport);
  window.removeEventListener("orientationchange", syncVisualViewport);
  window.visualViewport?.removeEventListener("resize", syncVisualViewport);
  window.visualViewport?.removeEventListener("scroll", syncVisualViewport);
  clearInlineGeometry();
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
  z-index: 2400;
  right: max(12px, env(safe-area-inset-right, 0px));
  bottom: max(12px, env(safe-area-inset-bottom, 0px));
  max-width: min(
    420px,
    calc(
      100vw - 24px - env(safe-area-inset-left, 0px) -
        env(safe-area-inset-right, 0px)
    )
  );
  max-height: min(
    70dvh,
    calc(
      100dvh - 24px - env(safe-area-inset-top, 0px) -
        env(safe-area-inset-bottom, 0px)
    )
  );
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.tip-toast__sheet {
  border-radius: 8px;
  overflow: auto;
  max-height: inherit;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.tip-toast__title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.tip-toast__body :deep(p:last-child) {
  margin-bottom: 0;
}

/* Narrow visual viewport (phones): full-width OK control. */
.tip-toast--narrow .tip-toast__actions {
  width: 100%;
}

.tip-toast--narrow .tip-toast__ok {
  width: 100%;
  min-height: 44px;
}
</style>
