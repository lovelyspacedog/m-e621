<template>
  <div>
    <v-container class="fill-height">
      <v-row align-center>
        <v-col cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
          <div class="d-flex ga-2 mb-2">
            <v-btn color="primary" block @click="promptCreateGroup">
              New group
            </v-btn>
          </div>

          <v-card variant="outlined" class="mb-4 pa-3">
            <div class="text-subtitle-2 mb-1">Copy from another site</div>
            <ProfileListSync kind="favorites" />
          </v-card>

          <v-expansion-panels multiple v-model="openPanels">
            <v-expansion-panel
              v-for="group in favorites.groups"
              :key="group.id"
              :value="group.id"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 pr-2">
                  <span>{{ group.name }}</span>
                  <span class="text-caption text-medium-emphasis ml-2">
                    {{ favorites.tagsInGroup(group.id).length }}
                  </span>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="d-flex ga-1 mb-2" v-if="group.id !== ungroupedId">
                  <v-btn size="small" variant="text" @click="promptRenameGroup(group.id, group.name)">
                    Rename
                  </v-btn>
                  <v-btn size="small" variant="text" color="error" @click="favorites.deleteGroup(group.id)">
                    Delete
                  </v-btn>
                </div>
                <v-list density="compact" color="transparent">
                  <v-list-item
                    v-for="tag in favorites.tagsInGroup(group.id)"
                    :key="tag.id"
                  >
                    <div>
                      <span v-if="tag.name.startsWith('-')">Exclude </span>
                      <TagLabel
                        :tag="{
                          name: tag.display || tag.name,
                          category: tag.category,
                        }"
                      />
                    </div>
                    <template #append>
                      <v-menu>
                        <template #activator="{ props: menuProps }">
                          <v-btn icon v-bind="menuProps">
                            <v-icon>mdi-folder-move</v-icon>
                          </v-btn>
                        </template>
                        <v-list density="compact">
                          <v-list-item
                            v-for="dest in favorites.groups"
                            :key="dest.id"
                            :disabled="dest.id === group.id"
                            @click="favorites.moveTag(tag.id, dest.id)"
                          >
                            <v-list-item-title>{{ dest.name }}</v-list-item-title>
                          </v-list-item>
                        </v-list>
                      </v-menu>
                      <v-btn
                        icon
                        :to="{
                          name: 'Posts',
                          query: {
                            tags: tag.name,
                          },
                        }"
                      >
                        <v-icon>mdi-magnify</v-icon>
                      </v-btn>
                      <v-btn icon @click="removeFavorite(tag.name, tag.category)">
                        <v-icon>mdi-close</v-icon>
                      </v-btn>
                    </template>
                  </v-list-item>
                  <v-list-item v-if="favorites.tagsInGroup(group.id).length === 0">
                    <v-list-item-title class="text-medium-emphasis">
                      No tags in this group
                    </v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import TagLabel from "@/Tag/TagLabel.vue";
import ProfileListSync from "@/Settings/ProfileListSync.vue";
import { useFavoritesStore } from "@/services/FavoriteStore";
import { UNGROUPED_FAVORITE_GROUP_ID } from "@/services/types";
import { useRouter } from "vue-router";

const favorites = useFavoritesStore();
const ungroupedId = UNGROUPED_FAVORITE_GROUP_ID;

const openPanels = computed({
  get() {
    return favorites.groups.filter((g) => !g.collapsed).map((g) => g.id);
  },
  set(ids: unknown) {
    const openIds = new Set(Array.isArray(ids) ? (ids as string[]) : []);
    for (const group of favorites.groups) {
      favorites.setGroupCollapsed(group.id, !openIds.has(group.id));
    }
  },
});

const removeFavorite = (name: string, category: string) => {
  favorites.setFavorite(name, category, false);
};

const promptCreateGroup = () => {
  const name = window.prompt("New group name");
  if (name == null) return;
  favorites.createGroup(name);
};

const promptRenameGroup = (groupId: string, current: string) => {
  const name = window.prompt("Rename group", current);
  if (name == null) return;
  favorites.renameGroup(groupId, name);
};

const router = useRouter();
const hasFavorites = computed(() => favorites.hasFavorites);

watch(hasFavorites, async () => {
  if (!hasFavorites.value) {
    router.push({ name: "Posts" });
  }
});
</script>
