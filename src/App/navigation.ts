import { useSavedSearchStore } from "@/services";
import { useFavoritesStore } from "@/services/FavoriteStore";
import { useSiteModeStore } from "@/services/SiteModeStore";
import { useSiteLabels } from "@/misc/util/siteLabels";
import { computed } from "vue";
import { useRouter } from "vue-router";

const hasFavorites = computed(() => {
  const store = useFavoritesStore();
  return store.hasFavorites;
});

const customItems = computed(() => {
  const store = useSavedSearchStore();
  return store.entries;
});

const resolveItem = (
  router: ReturnType<typeof useRouter>,
  item: {
    icon: string;
    name: string;
    exact: boolean;
    to: { name: string; query?: Record<string, string> };
  },
) => ({
  ...item,
  resolved: router.resolve(item.to).href,
});

export const useHomeNavigationItem = () => {
  const router = useRouter();
  const siteMode = useSiteModeStore();
  return computed(() =>
    resolveItem(router, {
      icon: "mdi-home",
      name: "Home",
      exact: true,
      to: {
        name: siteMode.isTailspace ? "TailspacePosts" : "Posts",
      },
    }),
  );
};

export const useTrailingNavigationItems = () => {
  const router = useRouter();
  const siteMode = useSiteModeStore();
  const { creatorLabel } = useSiteLabels();
  return computed(() => {
    const settings = {
      icon: "mdi-cog",
      name: "Settings",
      exact: false,
      to: {
        name: "Settings",
      },
    };

    // Tailspace mode: only Posts + Comics + Settings
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
        settings,
      ].map((item) => resolveItem(router, item));
    }

    const remoteItems = [
      {
        icon: "mdi-bookshelf",
        name: "Pools",
        exact: false,
        to: {
          name: "Pools",
        },
      },
      {
        icon: "mdi-chart-timeline-variant-shimmer",
        name: "Post Suggester",
        exact: true,
        to: {
          name: "Suggester",
        },
      },
      {
        icon: "mdi-cloud-tags",
        name: "Favorite Analyzer",
        exact: true,
        to: {
          name: "FavoritesAnalyzer",
        },
      },
      {
        icon: "mdi-view-dashboard-variant",
        name: `${creatorLabel.value} Dashboard`,
        exact: true,
        to: {
          name: "Dashboard",
        },
      },
      ...(hasFavorites.value
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
        : []),
    ];
    return [...(siteMode.isLocal ? [] : remoteItems), settings].map((item) =>
      resolveItem(router, item),
    );
  });
};

export const useNavigationItems = () => {
  const router = useRouter();
  const home = useHomeNavigationItem();
  const trailing = useTrailingNavigationItems();
  const navigationItems = computed(() => [
    home.value,
    ...customItems.value.map((entry) =>
      resolveItem(router, {
        icon: "mdi-panorama-variant",
        name: entry.name,
        exact: true,
        to: {
          name: "Posts",
          query: {
            tags: entry.tags.join(" "),
          },
        },
      }),
    ),
    ...trailing.value,
  ]);
  return navigationItems;
};
