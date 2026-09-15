<template>
  <v-list>
    <PoolInfo v-if="pool && showPoolBrowse" class="mb-2" :pool-id="pool" />
    <v-list-item v-for="(item, i) in items" :key="i" @click.stop="item.action" :router="!!item.route" exact :to="item.route" >
      {{ item.text }}
    </v-list-item>
  </v-list>
</template>

<script lang="ts">
import PoolInfo from "@/Pool/PoolInfo.vue";
import { useBlacklistStore, useSiteModeStore, useUrlStore } from "@/services";
import { useFavoritesStore } from "@/services/FavoriteStore";
import { computed, defineComponent } from "vue";
import { openUrlInNewTab } from "@/misc/util/url";
import { isCreatorCategory, useSiteLabels } from "@/misc/util/siteLabels";
import { isE621FamilyMode } from "@/misc/util/siteCapabilities";
import { useRouter } from "vue-router";

export default defineComponent({
    props: {
        name: {
            type: String,
            required: true,
        },
        category: {
            type: String,
            required: true,
        },
    },
    setup(props, context) {
        const blacklist = useBlacklistStore();
        const favorites = useFavoritesStore();
        const urlStore = useUrlStore();
        const siteMode = useSiteModeStore();
        const wikiUrl = computed(() => `${urlStore.e621Url}wiki/show?title=${props.name}`);
        const e621Url = computed(() => `${urlStore.e621Url}posts?tags=${props.name}`);
        const furbooruSearchUrl = computed(
          () => `${urlStore.e621Url}search?q=${encodeURIComponent(props.name)}`,
        );
        const isBlacklisted = computed(() => blacklist.tagIsBlacklisted(props.name));
        const isFavorited = computed(() => favorites.isFavorited(props.name, props.category));
        const router = useRouter();
        const { creatorLabel } = useSiteLabels();
        const isE621Family = computed(() => isE621FamilyMode(siteMode.activeMode));
        const pool = computed(() => {
            if(props.category === "pool") {
                const match = /pool:(\d+)/.exec(props.name);
                if(match) {
                    return +match[1];
                }
            }
            return false;
        });
        const showPoolBrowse = computed(() => {
          if (!pool.value) return false;
          // Inkbunny pools browse via Posts tags; Pool page is e621-shaped (H15/H13).
          if (siteMode.isInkbunny) return false;
          return isE621Family.value;
        });
        const toggleFavorite = () => {
            favorites.setFavorite(props.name, props.category, !isFavorited.value);
        };
        const items = computed<{
            text: string;
            action: () => void;
            visible: boolean;
            route?: any;
        }[]>(() => [
            {
                text: isFavorited.value ? "Unstar" : "Star",
                action: () => {
                    toggleFavorite();
                },
                visible: true,
            },
            {
                text: "Browse pool",
                route: siteMode.isInkbunny
                  ? { name: "Posts", query: { tags: `pool:${pool.value || 0}` } }
                  : {
                      name: "Pool",
                      params: {
                          id: pool.value || 0,
                      },
                    },
                action: async () => {
                    if (!pool.value) return;
                    if (siteMode.isInkbunny) {
                      router.push({
                        name: "Posts",
                        query: { tags: `pool:${pool.value}` },
                      });
                      return;
                    }
                    router.push({
                        name: "Pool",
                        params: {
                            id: pool.value,
                        },
                    });
                },
                visible: !!pool.value && (isE621Family.value || siteMode.isInkbunny),
            },
            {
                text: "Search",
                route: {
                    name: "Posts",
                    query: {
                        tags: props.name,
                    },
                },
                action: async () => {
                    router.push({
                        name: "Posts",
                        query: {
                            tags: props.name,
                        },
                    });
                },
                visible: true,
            },
            {
                text: isBlacklisted.value
                    ? "Remove from blacklist"
                    : "Add to blacklist",
                action: () => {
                    if (isBlacklisted.value) {
                        const idx = blacklist.tags.findIndex(
                          (tags) => tags.length === 1 && tags[0] === props.name.toLowerCase().replace(/ /g, "_"),
                        );
                        blacklist.removeTag(idx >= 0 ? idx : 0, props.name);
                    }
                    else {
                        blacklist.addTag(blacklist.tags.length, props.name);
                    }
                },
                visible: true,
            },
            {
                text: `Open ${siteMode.activeLabel} wiki`,
                action: () => {
                    openUrlInNewTab(wikiUrl.value);
                },
                visible: isE621Family.value,
            },
            {
                text: siteMode.isFurbooru
                  ? "Search on Furbooru"
                  : siteMode.isFurAffinity
                    ? "Search on FurAffinity"
                  : siteMode.isWeasyl
                    ? "Search on Weasyl"
                  : siteMode.isItaku
                    ? "Search on Itaku"
                  : siteMode.isSofurry
                    ? "Search on SoFurry"
                  : `Search on ${siteMode.activeLabel}`,
                action: () => {
                    openUrlInNewTab(
                      siteMode.isFurbooru
                        ? furbooruSearchUrl.value
                        : siteMode.isFurAffinity
                          ? `https://www.furaffinity.net/search/?q=${encodeURIComponent(props.name)}`
                        : siteMode.isWeasyl
                          ? `https://www.weasyl.com/search?q=${encodeURIComponent(props.name)}`
                        : siteMode.isItaku
                          ? `https://itaku.ee/home/gallerymature?tags=${encodeURIComponent(props.name)}`
                        : siteMode.isSofurry
                          ? `https://www.sofurry.com/browse?q=${encodeURIComponent(props.name)}`
                          : e621Url.value,
                    );
                },
                visible:
                  isE621Family.value ||
                  siteMode.isFurbooru ||
                  siteMode.isFurAffinity ||
                  siteMode.isWeasyl ||
                  siteMode.isItaku ||
                  siteMode.isSofurry,
            },
            {
                text: `View in ${creatorLabel.value} Dashboard`,
                action: async () => {
                    router.push({
                        name: "DashboardResult",
                        params: {
                            name: props.name,
                        },
                    });
                },
                visible: isCreatorCategory(props.category) && isE621Family.value,
            },
        ].filter(item => item.visible));
        return {
            items,
            pool,
            showPoolBrowse,
        };
    },
    components: { PoolInfo }
});
</script>
