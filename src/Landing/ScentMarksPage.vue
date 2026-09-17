<template>
  <section class="scent-page pa-4">
    <div class="scent-inner mx-auto">
      <div class="d-flex align-center flex-wrap ga-2 mb-4">
        <v-btn
          variant="text"
          color="primary"
          :to="{ name: 'LandingPage' }"
          aria-label="Back to landing"
        >
          <v-icon start>mdi-arrow-left</v-icon>
          Home
        </v-btn>
        <h1 class="text-h4 mb-0">Scent Marks</h1>
      </div>

      <p class="text-body-2 text-medium-emphasis mb-6">
        Leave an anonymous note for anyone visiting m-e621. Optional display
        name; no accounts. Keep it short and kind.
      </p>

      <v-card class="mb-6 scent-compose" variant="flat" border>
        <v-card-title class="text-subtitle-1 text-high-emphasis">
          Leave a mark
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="draftName"
            label="Display name (optional)"
            maxlength="32"
            counter="32"
            variant="outlined"
            bg-color="surface"
            color="primary"
            density="comfortable"
            autocomplete="nickname"
            hide-details="auto"
            class="mb-3 scent-field"
          />
          <v-textarea
            v-model="draftText"
            label="Your message"
            maxlength="500"
            counter="500"
            rows="3"
            variant="outlined"
            bg-color="surface"
            color="primary"
            density="comfortable"
            hide-details="auto"
            class="mb-3 scent-field"
            @keydown.ctrl.enter="submitMark"
          />
          <div class="d-flex align-center flex-wrap ga-2">
            <v-btn
              color="primary"
              variant="flat"
              :loading="posting"
              :disabled="!draftText.trim() || posting"
              @click="submitMark"
            >
              Post scent mark 🐶
            </v-btn>
            <span v-if="formError" class="text-error text-body-2">{{
              formError
            }}</span>
            <span v-else-if="formOk" class="text-medium-emphasis text-body-2">{{
              formOk
            }}</span>
          </div>
        </v-card-text>
      </v-card>

      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
        <h2 class="text-h6 mb-0">Wall</h2>
        <v-btn
          size="small"
          variant="text"
          :loading="loading"
          @click="refresh"
        >
          <v-icon start>mdi-refresh</v-icon>
          Refresh
        </v-btn>
      </div>

      <v-alert
        v-if="listError"
        type="error"
        variant="tonal"
        class="mb-4"
        density="compact"
      >
        {{ listError }}
      </v-alert>

      <v-progress-linear
        v-if="loading && !marks.length"
        indeterminate
        class="mb-4"
      />

      <p
        v-else-if="!loading && !marks.length && !listError"
        class="text-medium-emphasis"
      >
        No scent marks yet. Be the first.
      </p>

      <v-list v-else bg-color="transparent" class="scent-list pa-0">
        <v-list-item
          v-for="mark in marks"
          :key="mark.id"
          class="scent-item mb-3 rounded"
          border
        >
          <v-list-item-title class="text-wrap text-body-1 text-high-emphasis mb-1">
            {{ mark.text }}
          </v-list-item-title>
          <v-list-item-subtitle class="text-wrap text-medium-emphasis">
            {{ mark.name?.trim() || "Anonymous" }}
            ·
            {{ formatWhen(mark.createdAt) }}
          </v-list-item-subtitle>
          <template v-if="modUnlocked" #append>
            <v-btn
              icon
              variant="text"
              color="error"
              size="small"
              aria-label="Delete mark"
              :loading="deletingId === mark.id"
              @click="removeMark(mark.id)"
            >
              <v-icon>mdi-delete-outline</v-icon>
            </v-btn>
          </template>
        </v-list-item>
      </v-list>

      <v-expansion-panels class="mt-8" variant="accordion">
        <v-expansion-panel>
          <v-expansion-panel-title>Moderation</v-expansion-panel-title>
          <v-expansion-panel-text>
            <p class="text-body-2 text-medium-emphasis mb-3">
              Host operators can unlock delete controls with the admin password
              stored as a hash on the VPS.
            </p>
            <div v-if="!modUnlocked" class="d-flex flex-wrap ga-2 align-center">
              <v-text-field
                v-model="adminPassword"
                type="password"
                label="Admin password"
                variant="outlined"
                bg-color="surface"
                color="primary"
                density="compact"
                hide-details
                autocomplete="current-password"
                class="scent-admin-field scent-field"
                @keydown.enter="unlockMod"
              />
              <v-btn
                color="primary"
                variant="tonal"
                :loading="unlocking"
                :disabled="unlocking"
                @click="unlockMod"
              >
                Unlock
              </v-btn>
            </div>
            <div v-else class="d-flex flex-wrap ga-2 align-center">
              <span class="text-body-2">Delete controls unlocked for this tab.</span>
              <v-btn variant="text" @click="lockMod">Lock</v-btn>
            </div>
            <p v-if="modError" class="text-error text-body-2 mt-2 mb-0">
              {{ modError }}
            </p>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useHead } from "@unhead/vue";
import {
  clearScentAdminPassword,
  createScentMark,
  deleteScentMark,
  getScentAdminPassword,
  listScentMarks,
  setScentAdminPassword,
  verifyScentAdminPassword,
  type ScentMark,
} from "./scentMarksApi";
import {
  findBlockedScentTerms,
  formatScentBlockedMessage,
} from "./scentMarksBlocklist";

useHead({
  title: "Scent Marks",
});

const marks = ref<ScentMark[]>([]);
const loading = ref(false);
const posting = ref(false);
const listError = ref("");
const formError = ref("");
const formOk = ref("");
const draftName = ref("");
const draftText = ref("");
const adminPassword = ref("");
const modUnlocked = ref(Boolean(getScentAdminPassword()));
const modError = ref("");
const unlocking = ref(false);
const deletingId = ref<string | null>(null);

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const refresh = async () => {
  loading.value = true;
  listError.value = "";
  try {
    marks.value = await listScentMarks();
  } catch (err) {
    listError.value =
      err instanceof Error
        ? err.message
        : "Could not load scent marks (API available on self-hosted serve.py).";
  } finally {
    loading.value = false;
  }
};

const submitMark = async () => {
  formError.value = "";
  formOk.value = "";
  const text = draftText.value.trim();
  if (!text) return;
  const name = draftName.value.trim() || undefined;
  const blocked = findBlockedScentTerms(text, name);
  if (blocked.length) {
    formError.value = formatScentBlockedMessage(blocked);
    return;
  }
  posting.value = true;
  try {
    await createScentMark({
      text,
      name,
    });
    draftText.value = "";
    formOk.value = "Posted.";
    await refresh();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : "Post failed";
  } finally {
    posting.value = false;
  }
};

const unlockMod = async () => {
  modError.value = "";
  const pw = adminPassword.value.trim();
  if (!pw) {
    modError.value = "Enter the admin password";
    return;
  }
  unlocking.value = true;
  try {
    await verifyScentAdminPassword(pw);
    setScentAdminPassword(pw);
    modUnlocked.value = true;
    adminPassword.value = "";
  } catch (err) {
    clearScentAdminPassword();
    modUnlocked.value = false;
    modError.value =
      err instanceof Error ? err.message : "Unlock failed";
  } finally {
    unlocking.value = false;
  }
};

const lockMod = () => {
  clearScentAdminPassword();
  modUnlocked.value = false;
  modError.value = "";
};

const removeMark = async (id: string) => {
  const pw = getScentAdminPassword();
  if (!pw) {
    modUnlocked.value = false;
    modError.value = "Unlock moderation first";
    return;
  }
  deletingId.value = id;
  modError.value = "";
  try {
    await deleteScentMark(id, pw);
    await refresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    modError.value = message;
    if (/unauthor/i.test(message)) {
      clearScentAdminPassword();
      modUnlocked.value = false;
    }
  } finally {
    deletingId.value = null;
  }
};

onMounted(() => {
  void refresh();
});
</script>

<style scoped>
.scent-page {
  min-height: 70vh;
}

.scent-inner {
  max-width: 720px;
}

.scent-compose {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.scent-field :deep(.v-field) {
  --v-field-input-padding-top: 10px;
}

.scent-field :deep(.v-label),
.scent-field :deep(.v-field-label),
.scent-field :deep(.v-counter) {
  opacity: 1;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.scent-field :deep(.v-field__outline) {
  --v-field-border-opacity: 0.55;
}

.scent-field :deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 1;
}

.scent-field :deep(input),
.scent-field :deep(textarea) {
  color: rgb(var(--v-theme-on-surface));
  caret-color: rgb(var(--v-theme-primary));
}

.scent-item {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.scent-admin-field {
  max-width: 280px;
  min-width: 200px;
}

.scent-list :deep(.v-list-item-title) {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
