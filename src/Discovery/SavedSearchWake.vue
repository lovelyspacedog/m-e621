<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <h1 class="text-h5 mb-0">Saved-search Wake-up</h1>
          <v-spacer />
          <v-btn
            variant="tonal"
            size="small"
            :loading="checking"
            :disabled="!galleryEntries.length"
            @click="checkAll"
          >
            Check all
          </v-btn>
        </div>

        <p class="text-body-2 text-medium-emphasis mb-4">
          For each saved search on this site profile, fetch the newest page and
          show how many posts are newer than your last open. Results also appear
          as +N badges on sidebar saved-search rows. Open marks the search as
          seen.
        </p>

        <v-alert
          v-if="!galleryEntries.length"
          type="info"
          density="compact"
          class="mb-4"
        >
          No gallery saved searches on this profile yet.
        </v-alert>

        <v-list v-else lines="two" border rounded>
          <v-list-item v-for="row in rows" :key="row.id">
            <v-list-item-title>
              {{ row.name }}
              <v-chip
                v-if="row.newer != null && row.newer > 0"
                size="x-small"
                color="primary"
                class="ml-2"
              >
                +{{ row.newer }}
              </v-chip>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ row.tags.join(" ") || "(empty tags)" }}
              <span v-if="row.status"> · {{ row.status }}</span>
            </v-list-item-subtitle>
            <template #append>
              <div class="d-flex ga-1">
                <v-btn
                  size="small"
                  variant="text"
                  :loading="row.loading"
                  @click="checkOne(row)"
                >
                  Check
                </v-btn>
                <v-btn size="small" variant="tonal" @click="openEntry(row)">
                  Open
                </v-btn>
              </div>
            </template>
          </v-list-item>
        </v-list>
      </v-col>
    </v-row>

    <TipDialog
      :tip-id="TIP_IDS.savedSearchWake"
      title="Saved-search Wake-up"
      v-model="tipOpen"
    >
      <p class="mb-0">
        Checks each saved search for newer posts since you last opened it from
        this tool or the sidebar. Hits show as +N on sidebar rows. News filters
        are omitted here — use News unread for those.
      </p>
    </TipDialog>
  </v-container>
</template>

<script setup lang="ts">
import {
  useAccountStore,
  useDiscoveryStore,
  useMainStore,
  usePostsStore,
  useSavedSearchStore,
  useSiteModeStore,
  useUrlStore,
} from "@/services";
import TipDialog from "@/misc/TipDialog.vue";
import { TIP_IDS } from "@/misc/tipIds";
import { useTipOpen } from "@/misc/useTipOpen";
import { checkSavedSearchWake } from "@/misc/util/savedSearchWakeCheck";
import { getApiService } from "@/worker/services";
import { BlacklistMode } from "@/services/types";
import { useHead } from "@unhead/vue";
import { computed, onMounted, reactive, toRaw } from "vue";
import { useRouter } from "vue-router";

useHead({ title: "Saved-search Wake-up" });

type WakeRow = {
  id: string;
  name: string;
  tags: string[];
  newer: number | null;
  newestKey: string | null;
  newestCreatedMs: number | null;
  status: string;
  loading: boolean;
};

const saved = useSavedSearchStore();
const discovery = useDiscoveryStore();
const siteMode = useSiteModeStore();
const account = useAccountStore();
const urlStore = useUrlStore();
const postsStore = usePostsStore();
const main = useMainStore();
const router = useRouter();
const { open: tipOpen, tryOpen } = useTipOpen(TIP_IDS.savedSearchWake);

const checking = computed(() => rows.some((r) => r.loading));

const galleryEntries = computed(() =>
  saved.entries.filter((e) => !e.news),
);

const rows = reactive<WakeRow[]>([]);

const rebuildRows = () => {
  rows.splice(
    0,
    rows.length,
    ...galleryEntries.value.map((e) => {
      const cursor = discovery.getWakeCursor(e.id);
      const hit = cursor?.lastHitCount;
      return {
        id: e.id,
        name: e.name,
        tags: [...e.tags],
        newer: typeof hit === "number" && hit > 0 ? hit : null,
        newestKey: cursor?.newestKey || null,
        newestCreatedMs: cursor?.createdMs ?? null,
        status: cursor?.lastOpenedAt
          ? `last open ${new Date(cursor.lastOpenedAt).toLocaleString()}`
          : "never opened",
        loading: false,
      };
    }),
  );
};

const checkOne = async (row: WakeRow) => {
  row.loading = true;
  row.status = "checking…";
  try {
    const cursor = discovery.getWakeCursor(row.id);
    const counted = await checkSavedSearchWake({
      mode: siteMode.activeMode,
      cursor,
      fetchLocal:
        siteMode.activeMode === "local"
          ? async () => {
              const { getLocalPostsPage } = await import(
                "@/misc/util/localMedia"
              );
              return getLocalPostsPage(1, 24, row.tags);
            }
          : undefined,
      fetchRemote:
        siteMode.activeMode !== "local"
          ? async () => {
              const api = await getApiService();
              return api.getPosts({
                blacklistMode: BlacklistMode.blur,
                blacklist: [],
                limit: 24,
                tags: row.tags,
                baseUrl: urlStore.e621Url,
                mode: siteMode.activeMode,
                page: 1,
                auth: toRaw(account.auth),
                userId: account.userId,
                sfwOnly: postsStore.sfwOnly,
                ...(siteMode.activeMode === "unified"
                  ? {
                      unified: toRaw(
                        (
                          await import("@/misc/util/postOrigin")
                        ).buildUnifiedFetchArgs(main.$state),
                      ),
                    }
                  : {}),
              });
            }
          : undefined,
    });
    discovery.recordWakeCheck(row.id, counted);
    const after = discovery.getWakeCursor(row.id);
    row.newer = after?.lastHitCount && after.lastHitCount > 0 ? after.lastHitCount : 0;
    row.newestKey = counted.newestKey;
    row.newestCreatedMs = counted.newestCreatedMs;
    row.status =
      row.newer > 0
        ? `${row.newer} newer than last open`
        : cursor?.newestKey
          ? "caught up"
          : "baseline set";
  } catch (err: unknown) {
    row.status = err instanceof Error ? err.message : String(err);
  } finally {
    row.loading = false;
  }
};

const checkAll = async () => {
  for (const row of rows) {
    await checkOne(row);
  }
};

const openEntry = (row: WakeRow) => {
  discovery.markSavedSearchOpened(row.id, {
    newestKey: row.newestKey || undefined,
    createdMs: row.newestCreatedMs ?? undefined,
  });
  row.newer = 0;
  row.status = "opened";
  router.push({
    name: "Posts",
    query: { tags: row.tags.join(" ") },
  });
};

onMounted(() => {
  tryOpen();
  rebuildRows();
});
</script>
