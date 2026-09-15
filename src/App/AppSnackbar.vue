<template>
  <v-snackbar color="secondary" v-model="open" location="right bottom" :timeout="action ? 8000 : 4000" timer="primary">
    {{ message }}
    <template #actions>
      <v-btn v-if="action" variant="text" color="accent" @click="runAction">
        {{ action.label }}
      </v-btn>
      <v-btn variant="text" @click="close">Close</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { useSnackbarStore } from "@/services";
import { computed } from "vue";

const snackbar = useSnackbarStore();

const close = () => {
  snackbar.clearMessage();
};

const runAction = async () => {
  const next = snackbar.action;
  snackbar.clearMessage();
  if (next) await next.onClick();
};

const message = computed(() => snackbar.message);
const action = computed(() => snackbar.action);

const open = computed<boolean>({
  get() {
    return !!snackbar.message;
  },
  set(open) {
    if (!open) {
      close();
    }
  },
});
</script>
