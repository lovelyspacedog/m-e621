import { useNewsStore, useSavedSearchStore } from "@/services";
import { useFavoritesStore } from "@/services/FavoriteStore";
import { useSiteModeStore } from "@/services/SiteModeStore";
import { useSiteLabels } from "@/misc/util/siteLabels";
import {
  isE621FamilyMode,
  modeSupportsPools,
  modeSupportsDiscoveryTools,
} from "@/misc/util/siteCapabilities";
import { peekNewsCachedArticles } from "@/worker/news/api";
import { browsePostsRoute } from "@/misc/util/browsePostsRoute";
import { computed } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";

export { browsePostsRoute } from "@/misc/util/browsePostsRoute";

const hasFavorites = computed(() => {
  const store = useFavoritesStore();
  return store.hasFavorites;
});

const customItems = computed(() => {
  const store = useSavedSearchStore();
  return store.entries;
});

export type NavLinkItem = {
  icon: string;
  name: string;
  exact: boolean;
  to: { name: string; query?: Record<string, string> };
  badge?: number;
  resolved: string;
};

const resolveItem = (
  router: ReturnType<typeof useRouter>,
  item: {
    icon: string;
    name: string;
    exact: boolean;
    to: { name: string; query?: Record<string, string> };
    badge?: number;
  },
): NavLinkItem => ({
  ...item,
  resolved: router.resolve(item.to as RouteLocationRaw).href,
});

export const useHomeNavigationItem = () => {
  const router = useRouter();
  return computed(() =>
    resolveItem(router, {
      icon: "mdi-home",
      name: "Home",
      exact: true,
      to: { name: "Home" },
    }),
  );
};

/** Tools submenu: Suggester, Analyzer, discovery tools, Dashboard. */
export const useToolNavigationItems = () => {
  const router = useRouter();
  const siteMode = useSiteModeStore();
  const { creatorLabel } = useSiteLabels();
  return computed(() => {
    if (!modeSupportsDiscoveryTools(siteMode.activeMode)) return [];
    const items: NavLinkItem[] = [
      resolveItem(router, {
        icon: "mdi-chart-timeline-variant-shimmer",
        name: "Post Suggester",
        exact: true,
        to: { name: "Suggester" },
      }),
      resolveItem(router, {
        icon: "mdi-cloud-tags",
        name: "Favorite Analyzer",
        exact: true,
        to: { name: "FavoritesAnalyzer" },
      }),
      resolveItem(router, {
        icon: "mdi-radar",
        name: "Artist Radar",
        exact: true,
        to: { name: "ArtistRadar" },
      }),
      resolveItem(router, {
        icon: "mdi-set-split",
        name: "Taste Diff",
        exact: true,
        to: { name: "TasteDiff" },
      }),
      resolveItem(router, {
        icon: "mdi-history",
        name: "History Insights",
        exact: true,
        to: { name: "HistoryInsights" },
      }),
      resolveItem(router, {
        icon: "mdi-shield-alert",
        name: "Blacklist Coach",
        exact: true,
        to: { name: "BlacklistCoach" },
      }),
      resolveItem(router, {
        icon: "mdi-bell-ring",
        name: "Saved-search Wake-up",
        exact: true,
        to: { name: "SavedSearchWake" },
      }),
      resolveItem(router, {
        icon: "mdi-image-search",
        name: "Cross-post Finder",
        exact: true,
        to: { name: "CrossPostFinder" },
      }),
      resolveItem(router, {
        icon: "mdi-account-multiple",
        name: "Similar Artists",
        exact: true,
        to: { name: "SimilarArtists" },
      }),
      resolveItem(router, {
        icon: "mdi-bookshelf",
        name: "Pool / Series Suggester",
        exact: true,
        to: { name: "PoolSeriesSuggester" },
      }),
      resolveItem(router, {
        icon: "mdi-package-variant",
        name: "Taste Pack",
        exact: true,
        to: { name: "TastePack" },
      }),
      resolveItem(router, {
        icon: "mdi-calendar-month",
        name: "Activity heatmap",
        exact: true,
        to: { name: "ActivityHeatmap" },
      }),
    ];
    if (isE621FamilyMode(siteMode.activeMode)) {
      items.push(
        resolveItem(router, {
          icon: "mdi-view-dashboard-variant",
          name: `${creatorLabel.value} Dashboard`,
          exact: true,
          to: { name: "Dashboard" },
        }),
      );
    }
    return items;
  });
};

export const useTrailingNavigationItems = () => {
  const router = useRouter();
  const siteMode = useSiteModeStore();
  const newsStore = useNewsStore();
  return computed(() => {
    const settings = {
      icon: "mdi-cog",
      name: "Settings",
      exact: false,
      to: {
        name: "Settings",
      },
    };

    // News: feed + settings only
    if (siteMode.isNews) {
      void newsStore.readCount;
      const cached = peekNewsCachedArticles();
      const unread = cached.filter((a) => !newsStore.isRead(a.id)).length;
      return [
        {
          icon: "mdi-newspaper",
          name: "News",
          exact: false,
          to: { name: "NewsFeed" },
          ...(unread > 0 ? { badge: unread } : {}),
        },
        settings,
      ].map((item) => resolveItem(router, item));
    }

    // Tailspace mode: only Posts + Comics + Following + Settings
    if (siteMode.isTailspace) {
      return [
        {
          icon: "mdi-image-multiple",
          name: "Posts",
          exact: false,
          to: { name: "TailspacePosts" },
        },
        {
          icon: "mdi-bookshelf",
          name: "Comics",
          exact: false,
          to: { name: "TailspaceComics" },
        },
        {
          icon: "mdi-account-heart",
          name: "Following",
          exact: false,
          to: { name: "TailspaceFollowing" },
        },
        settings,
      ].map((item) => resolveItem(router, item));
    }

    const poolItems = modeSupportsPools(siteMode.activeMode)
      ? [
          {
            icon: "mdi-bookshelf",
            name: "Pools",
            exact: false,
            to: {
              name: "Pools",
            },
          },
        ]
      : [];
    // Tools live in useToolNavigationItems() → sidebar Tools group.
    const starredItem = hasFavorites.value
      ? [
          {
            icon: "mdi-star",
            name: "Starred",
            exact: true,
            to: {
              name: "Starred",
            },
          },
        ]
      : [];
    return [
      {
        icon: "mdi-image-multiple",
        name: "Posts",
        exact: false,
        to: browsePostsRoute(siteMode.activeMode),
      },
      ...(siteMode.supportsSavedPosts
        ? [
            {
              icon: "mdi-bookmark",
              name: "Saved",
              exact: true,
              to: {
                name: "SavedPosts",
              },
            },
          ]
        : []),
      ...poolItems,
      ...starredItem,
      settings,
    ].map((item) => resolveItem(router, item));
  });
};

export const useNavigationItems = () => {
  const router = useRouter();
  const siteMode = useSiteModeStore();
  const home = useHomeNavigationItem();
  const trailing = useTrailingNavigationItems();
  const tools = useToolNavigationItems();
  const navigationItems = computed(() => [
    home.value,
    ...customItems.value.map((entry) =>
      resolveItem(router, {
        icon: "mdi-panorama-variant",
        name: entry.name,
        exact: true,
        to: siteMode.isTailspace
          ? {
              name: "TailspacePosts",
              query: {
                tags: entry.tags.join(" "),
              },
            }
          : siteMode.isNews
            ? {
                name: "NewsFeed",
                query: {
                  tags: entry.tags.join(" "),
                  ...(entry.news?.source ? { source: entry.news.source } : {}),
                  ...(entry.news?.feed ? { feed: entry.news.feed } : {}),
                  ...(entry.news?.view ? { view: entry.news.view } : {}),
                },
              }
            : {
                name: "Posts",
                query: {
                  tags: entry.tags.join(" "),
                },
              },
      }),
    ),
    ...tools.value,
    ...trailing.value,
  ]);
  return navigationItems;
};
