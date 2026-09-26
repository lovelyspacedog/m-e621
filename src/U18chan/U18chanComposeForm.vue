<template>
  <div class="u18-compose">
    <v-text-field
      v-model="name"
      label="Name (optional; Name#trip for tripcode)"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-2"
    />
    <v-text-field
      v-model="subject"
      label="Subject"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-2"
    />
    <v-textarea
      v-model="comment"
      label="Comment"
      variant="outlined"
      density="compact"
      rows="3"
      hide-details
      class="mb-2"
    />
    <v-text-field
      v-model="password"
      label="Deletion password"
      variant="outlined"
      density="compact"
      type="password"
      hide-details
      class="mb-2"
    />
    <v-file-input
      v-model="file"
      label="Image (optional)"
      accept="image/jpeg,image/png,image/gif"
      variant="outlined"
      density="compact"
      prepend-icon=""
      prepend-inner-icon="mdi-paperclip"
      hide-details
      class="mb-3"
      show-size
    />
    <v-btn
      color="primary"
      :loading="submitting"
      :disabled="!canSubmit"
      @click="submit"
    >
      {{ topicId ? "Reply" : "Create thread" }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useMainStore } from "@/services";
import type { U18chanPostPayload } from "@/worker/u18chan/types";

const props = defineProps<{
  liveBoard: string;
  topicId?: number;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  submit: [payload: Omit<U18chanPostPayload, "liveBoard" | "topicId">];
}>();

const main = useMainStore();
const name = ref("");
const subject = ref("");
const comment = ref("");
const password = ref("password");
const file = ref<File[] | File | null>(null);

onMounted(() => {
  name.value = main.account.username || "";
  password.value = main.account.apiKey || "password";
});

const canSubmit = computed(
  () => !!(comment.value.trim() || file.value) && !props.submitting,
);

const readFile = (f: File): Promise<{ name: string; base64: string; mime: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      resolve({ name: f.name, base64: dataUrl, mime: f.type || "application/octet-stream" });
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(f);
  });

const submit = async () => {
  if (!canSubmit.value) return;
  const chosen = Array.isArray(file.value) ? file.value[0] : file.value;
  let fileName: string | undefined;
  let fileBase64: string | undefined;
  let fileMime: string | undefined;
  if (chosen) {
    const parsed = await readFile(chosen);
    fileName = parsed.name;
    fileBase64 = parsed.base64;
    fileMime = parsed.mime;
  }
  emit("submit", {
    name: name.value.trim() || undefined,
    subject: subject.value.trim() || undefined,
    comment: comment.value,
    password: password.value || "password",
    fileName,
    fileBase64,
    fileMime,
  });
};
</script>
