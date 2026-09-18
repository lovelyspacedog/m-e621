<template>
  <v-list>
    <PoolInfo
      v-if="pool && showPoolBrowse"
      class="mb-2"
      :pool-id="pool"
      :origin-mode="poolOrigin"
    />
    <v-list-item v-for="(item, i) in items" :key="i" @click.stop="item.action" :router="!!item.route" exact :to="item.route" >
      {{ item.text }}
    </v-list-item>
  </v-list>
</template>

<script lang="ts">
import PoolInfo from "@/Pool/PoolInfo.vue";
import { useBlacklistStore, useSiteModeStore, useUrlStore } from "@/services";
import { useFavoritesStore } from "@/services/FavoriteStore";
import { useMainStore } from "@/services/state";
import { computed, defineComponent, type PropType } from "vue";
import { openUrlInNewTab } from "@/misc/util/url";
import { isCreatorCategory, useSiteLabels } from "@/misc/util/siteLabels";
import { isE621FamilyMode, modeSupportsPools } from "@/misc/util/siteCapabilities";
import {
  poolFamilyChildren,
  poolRouteQuery,
  resolvePoolOrigin,
  isPoolOriginMode,
} from "@/misc/util/poolOrigin";
import { useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import type { PoolOriginMode } from "@/services/types";

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
        originMode: {
            type: String as PropType<PoolOriginMode | null>,
            default: null,
        },
    },
    setup(props) {
        const blacklist = useBlacklistStore();
        const favorites = useFavoritesStore();
        const urlStore = useUrlStore();
        const siteMode = useSiteModeStore();
        const main = useMainStore();
        const route = useRoute();
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
        const poolOrigin = computed(() => {
          if (isPoolOriginMode(props.originMode)) return props.originMode;
          const fromRoute = resolvePoolOrigin(route.query.origin, siteMode.activeMode);
          if (fromRoute) return fromRoute;
          if (siteMode.isInkbunny) return "inkbunny" as const;
          if (siteMode.isUnified) {
            const kids = poolFamilyChildren(main.$state);
            return kids.length === 1 ? kids[0].mode : null;
          }
          return null;
        });
        const showPoolBrowse = computed(() => {
          if (!pool.value) return false;
          if (!modeSupportsPools(siteMode.activeMode)) return false;
          // Federated needs an origin when multiple pool children exist.
          if (siteMode.isUnified && !poolOrigin.value) return false;
          return true;
        });
        const poolBrowseRoute = computed(() => ({
          name: "Pool" as const,
          params: { id: pool.value || 0 },
          query: poolRouteQuery(poolOrigin.value),
        }));
        const toggleFavorite = () => {
            favorites.setFavorite(props.name, props.category, !isFavorited.value);
        };
        const items = computed<{
            text: string;
            action: () => void;
            visible: boolean;
            route?: RouteLocationRaw;
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
                route: poolBrowseRoute.value,
                action: async () => {
                    if (!pool.value) return;
                    router.push(poolBrowseRoute.value);
                },
                visible: !!pool.value && showPoolBrowse.value,
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
            poolOrigin,
        };
    },
    components: { PoolInfo }
});
</script>
