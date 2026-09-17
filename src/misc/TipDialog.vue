<template>
  <v-dialog
    :model-value="modelValue"
    max-width="480"
    scrim="primary"
    @update:model-value="onDialogUpdate"
  >
    <v-card color="secondary">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-information-outline</v-icon>
        {{ title }}
        <v-spacer />
        <v-btn
          icon
          variant="text"
          :aria-label="`Close ${title}`"
          @click="close(false)"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <slot />
        <v-checkbox
          v-model="dontShowAgain"
          class="mt-4"
          color="accent"
          density="compact"
          hide-details
          label="Don't show this again"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="accent" variant="flat" @click="close(true)">Got it</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useAppearanceStore } from "@/services";

const props = defineProps<{
  tipId: string;
  title: string;
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const appearance = useAppearanceStore();
const dontShowAgain = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) dontShowAgain.value = false;
  },
);

const persistDismissalIfNeeded = () => {
  if (dontShowAgain.value) {
    appearance.dismissTip(props.tipId);
  }
};

const close = (fromAction: boolean) => {
  if (fromAction || dontShowAgain.value) {
    persistDismissalIfNeeded();
  }
  emit("update:modelValue", false);
};

const onDialogUpdate = (open: boolean) => {
  if (!open) {
    persistDismissalIfNeeded();
  }
  emit("update:modelValue", open);
};
</script>
