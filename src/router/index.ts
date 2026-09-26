import { createRouter, createWebHashHistory } from 'vue-router'
import { modeSupportsSavedPosts } from '@/misc/util/postOrigin'
import { resolvePoolOrigin } from '@/misc/util/poolOrigin'
import { isE621FamilyMode, modeSupportsDiscoveryTools, modeSupportsFavoriteAnalyzer, modeSupportsPools, modeSupportsSuggester } from '@/misc/util/siteCapabilities'
import { blockedToolRedirectName } from '@/misc/util/blockedToolRedirect'
import { shouldSkipViewTransition } from '@/misc/util/viewTransition'
import { useMainStore } from '@/services/state'
import {
  applySettingsOverlay,
  queryValueForSection,
  sectionFromSettingsPath,
  settingsDesktopFallbackPath,
} from '@/Settings/settingsOverlay'

// TODO?
// // workaround for errors in console
// const originalPush = Router.prototype.push;
// Router.prototype.push = function push(location: any) {
//   return (originalPush.call(this, location) as any).catch((err: any) => err);
// };



const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  // routes: [
  //   {
  //     path: '/',
  //     name: 'home',
  //     component: HomeView,
  //   },
  //   {
  //     path: '/about',
  //     name: 'about',
  //     // route level code-splitting
  //     // this generates a separate chunk (About.[hash].js) for this route
  //     // which is lazy-loaded when the route is visited.
  //     component: () => import('../views/AboutView.vue'),
  //   },
  routes: [
    {
      path: "/",
      name: "LandingPage",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Landing/LandingPage.vue"),
      meta: {
        minimalHeader: true,
      },
    },
    {
      path: "/scent-marks",
      name: "ScentMarks",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Landing/ScentMarksPage.vue"),
      meta: {
        minimalHeader: true,
      },
    },
    {
      path: "/home",
      name: "Home",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Home/HomePage.vue"),
    },
    {
      path: "/posts",
      // alias: "/e621",
      name: "Posts",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Post/PostsPage.vue"),
    },
    {
      path: "/pools",
      name: "Pools",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Pool/PoolsSearchPage.vue"),
    },
    {
      path: "/pools/:id",
      name: "Pool",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Pool/PoolPage.vue"),
    },
    {
      path: "/settings",
      name: "Settings",
      component: () =>
        import(
          /* webpackChunkName: "settings" */ "@/Settings/SettingsPage.vue"
        ),
    },
    {
      path: "/settings/account",
      name: "AccountSettings",
      component: () =>
        import(
          /* webpackChunkName: "settings" */ "@/Settings/AccountSettingsPage.vue"
        ),
    },
    {
      path: "/settings/posts",
      name: "PostSettings",
      component: () =>
        import(
          /* webpackChunkName: "settings" */ "@/Settings/PostSettingsPage.vue"
        ),
    },
    {
      path: "/settings/blacklist",
      name: "BlacklistSettings",
      component: () =>
        import(
          /* webpackChunkName: "settings" */ "@/Settings/BlacklistSettingsPage.vue"
        ),
    },
    {
      path: "/settings/appearance",
      name: "AppearanceSettings",
      component: () =>
        import(
          /* webpackChunkName: "settings" */ "@/Settings/AppearanceSettingsPage.vue"
        ),
    },
    {
      path: "/settings/appearance/themes",
      name: "Themes",
      component: () =>
        import(/* webpackChunkName: "settings" */ "@/Settings/ThemePage.vue"),
    },
    {
      path: "/settings/history",
      name: "HistorySettings",
      component: () =>
        import(
          /* webpackChunkName: "settings" */ "@/Settings/HistorySettingsPage.vue"
        ),
    },
    {
      path: "/settings/restore",
      name: "RestoreSettings",
      component: () =>
        import(
          /* webpackChunkName: "settings" */ "@/Settings/RestoreSettingsPage.vue"
        ),
    },
    {
      path: "/settings/info",
      name: "Infos",
      component: () =>
        import(/* webpackChunkName: "settings" */ "@/Settings/InfoPage.vue"),
    },
    {
      path: "/settings/shortcuts",
      name: "ShortcutSettings",
      component: () =>
        import(
          /* webpackChunkName: "settings" */ "@/Settings/ShortcutSettingsPage.vue"
        ),
    },
    {
      path: "/parser",
      name: "Parser",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Parser/ParserTestPage.vue"),
    },
    {
      path: "/about",
      name: "About",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/About/AboutPage.vue"),
    },
    {
      path: "/analyzer",
      name: "FavoritesAnalyzer",
      component: () =>
        import(
          /* webpackChunkName: "analyzer" */ "@/Analyzer/FavoritesAnalyzer.vue"
        ),
    },
    {
      path: "/analyzer/result",
      name: "FavoritesAnalyzerResult",
      component: () =>
        import(
          /* webpackChunkName: "analyzer" */ "@/Analyzer/FavoritesAnalyzerResult.vue"
        ),
    },
    {
      path: "/suggester",
      name: "Suggester",
      component: () =>
        import(
          /* webpackChunkName: "analyzer" */ "@/Suggester/SuggesterInput.vue"
        ),
    },
    {
      path: "/suggester/result",
      name: "SuggesterResult",
      component: () =>
        import(
          /* webpackChunkName: "analyzer" */ "@/Suggester/SuggesterResult.vue"
        ),
    },
    {
      path: "/dash",
      name: "Dashboard",
      component: () =>
        import(
          /* webpackChunkName: "dashboard" */ "@/ArtistDashboard/Dashboard.vue"
        ),
    },
    {
      path: "/dash/:name",
      name: "DashboardResult",
      component: () =>
        import(
          /* webpackChunkName: "dashboard" */ "@/ArtistDashboard/DashboardResult.vue"
        ),
    },
    {
      path: "/tools/radar",
      name: "ArtistRadar",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/ArtistRadar.vue"
        ),
    },
    {
      path: "/tools/radar/result",
      name: "ArtistRadarResult",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/ArtistRadarResult.vue"
        ),
    },
    {
      path: "/tools/taste-diff",
      name: "TasteDiff",
      component: () =>
        import(/* webpackChunkName: "discovery" */ "@/Discovery/TasteDiff.vue"),
    },
    {
      path: "/tools/taste-diff/result",
      name: "TasteDiffResult",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/TasteDiffResult.vue"
        ),
    },
    {
      path: "/tools/history",
      name: "HistoryInsights",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/HistoryInsights.vue"
        ),
    },
    {
      path: "/tools/blacklist-coach",
      name: "BlacklistCoach",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/BlacklistCoach.vue"
        ),
    },
    {
      path: "/tools/blacklist-coach/result",
      name: "BlacklistCoachResult",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/BlacklistCoachResult.vue"
        ),
    },
    {
      path: "/tools/saved-wake",
      name: "SavedSearchWake",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/SavedSearchWake.vue"
        ),
    },
    {
      path: "/tools/cross-post",
      name: "CrossPostFinder",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/CrossPostFinder.vue"
        ),
    },
    {
      path: "/tools/similar-artists",
      name: "SimilarArtists",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/SimilarArtists.vue"
        ),
    },
    {
      path: "/tools/similar-artists/result",
      name: "SimilarArtistsResult",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/SimilarArtistsResult.vue"
        ),
    },
    {
      path: "/tools/pools",
      name: "PoolSeriesSuggester",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/PoolSeriesSuggester.vue"
        ),
    },
    {
      path: "/tools/pools/result",
      name: "PoolSeriesSuggesterResult",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/PoolSeriesSuggesterResult.vue"
        ),
    },
    {
      path: "/tools/taste-pack",
      name: "TastePack",
      component: () =>
        import(/* webpackChunkName: "discovery" */ "@/Discovery/TastePack.vue"),
    },
    {
      path: "/tools/activity",
      name: "ActivityHeatmap",
      component: () =>
        import(
          /* webpackChunkName: "discovery" */ "@/Discovery/ActivityHeatmap.vue"
        ),
    },
    {
      alias: ["/favorites"],
      path: "/starred",
      name: "Starred",
      component: () =>
        import(/* webpackChunkName: "favorites" */ "@/Favorites/FavoritesPage.vue"),
    },
    {
      path: "/saved",
      name: "SavedPosts",
      component: () =>
        import(/* webpackChunkName: "saved" */ "@/Post/SavedPostsPage.vue"),
    },
    {
      path: "/tailspace/posts",
      name: "TailspacePosts",
      component: () =>
        import(/* webpackChunkName: "tailspace" */ "@/Tailspace/TailspacePostsPage.vue"),
    },
    {
      path: "/tailspace/comics",
      name: "TailspaceComics",
      component: () =>
        import(/* webpackChunkName: "tailspace" */ "@/Tailspace/TailspaceComicsPage.vue"),
    },
    {
      path: "/tailspace/following",
      name: "TailspaceFollowing",
      component: () =>
        import(/* webpackChunkName: "tailspace" */ "@/Tailspace/TailspaceFollowingPage.vue"),
    },
    {
      path: "/tailspace/comic/:name+",
      name: "TailspaceComic",
      component: () =>
        import(/* webpackChunkName: "tailspace" */ "@/Tailspace/TailspaceComicReader.vue"),
    },
    {
      path: "/u18chan/watched",
      name: "U18chanWatched",
      component: () =>
        import(/* webpackChunkName: "u18chan" */ "@/U18chan/U18chanWatchedPage.vue"),
    },
    {
      path: "/u18chan/:board/thread/:id",
      name: "U18chanThread",
      component: () =>
        import(/* webpackChunkName: "u18chan" */ "@/U18chan/U18chanThreadPage.vue"),
    },
    {
      path: "/u18chan/:board?",
      name: "U18chanCatalog",
      component: () =>
        import(/* webpackChunkName: "u18chan" */ "@/U18chan/U18chanCatalogPage.vue"),
    },
    {
      path: "/news",
      name: "NewsFeed",
      component: () =>
        import(/* webpackChunkName: "news" */ "@/News/NewsFeedPage.vue"),
    },
    {
      path: "/news/custom/:feedId/:itemKey",
      name: "NewsCustomArticle",
      component: () =>
        import(/* webpackChunkName: "news" */ "@/News/NewsArticlePage.vue"),
    },
    {
      path: "/news/:source/:id",
      name: "NewsArticle",
      component: () =>
        import(/* webpackChunkName: "news" */ "@/News/NewsArticlePage.vue"),
    },
    // Legacy Flayrah routes → News
    {
      path: "/flayrah",
      redirect: { name: "NewsFeed" },
    },
    {
      path: "/flayrah/:id",
      redirect: (to) => ({
        name: "NewsArticle",
        params: {
          source: "flayrah",
          id: String(to.params.id),
        },
        query: to.query,
      }),
    },
    {
      path: "/:pathMatch(.*)",
      name: "ErrorPage",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Error/ErrorPage.vue"),
    },
  ],
})

router.beforeEach((to, from) => {
  // Desktop: /settings* opens as an overlay over the previous page.
  if (to.path.startsWith("/settings")) {
    try {
      // Vuetify display is not available here — use matchMedia (same breakpoint).
      const isMobile =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 959.98px)").matches;
      if (!isMobile) {
        const section = sectionFromSettingsPath(to.path);
        const hash = (to.hash || "").replace(/^#/, "");
        const fallbackPath = settingsDesktopFallbackPath(from.path);
        const query = { ...from.query, settings: queryValueForSection(section) };
        // Prefer preserving the page under the overlay when navigating from elsewhere.
        if (from.path && !from.path.startsWith("/settings")) {
          applySettingsOverlay(section, hash);
          return { path: from.path, query, hash: from.hash };
        }
        applySettingsOverlay(section, hash);
        return { path: fallbackPath, query };
      }
    } catch {
      // ignore
    }
  }

  // Mode ↔ route guards (C3 / M31). Pinia may be unavailable during early boot.
  try {
    const mode = useMainStore().activeMode;
    const tailspaceRoutes = new Set([
      "TailspacePosts",
      "TailspaceComics",
      "TailspaceComic",
      "TailspaceFollowing",
    ]);
    const u18chanRoutes = new Set([
      "U18chanCatalog",
      "U18chanThread",
      "U18chanWatched",
    ]);
    const newsRoutes = new Set([
      "NewsFeed",
      "NewsArticle",
      "NewsCustomArticle",
    ]);
    const discoveryToolRoutes = new Set([
      "ArtistRadar",
      "ArtistRadarResult",
      "TasteDiff",
      "TasteDiffResult",
      "HistoryInsights",
      "BlacklistCoach",
      "BlacklistCoachResult",
      "SavedSearchWake",
      "CrossPostFinder",
      "SimilarArtists",
      "SimilarArtistsResult",
      "PoolSeriesSuggester",
      "PoolSeriesSuggesterResult",
      "TastePack",
      "ActivityHeatmap",
    ]);
    const e621ShapedRoutes = new Set([
      "Posts",
      "Pools",
      "Pool",
      "Suggester",
      "SuggesterResult",
      "FavoritesAnalyzer",
      "FavoritesAnalyzerResult",
      "Dashboard",
      "DashboardResult",
      ...discoveryToolRoutes,
      // e621 DText debug page — not dedicated-chrome browse
      "Parser",
    ]);
    if (mode === "tailspace" && e621ShapedRoutes.has(String(to.name))) {
      return { name: "TailspacePosts", query: to.query };
    }
    if (mode === "u18chan" && e621ShapedRoutes.has(String(to.name))) {
      return { name: "U18chanCatalog", query: to.query };
    }
    if (mode === "news" && e621ShapedRoutes.has(String(to.name))) {
      return { name: "NewsFeed", query: to.query };
    }
    if (mode !== "tailspace" && tailspaceRoutes.has(String(to.name))) {
      // Federated Pools may open Tailspace comics without leaving Federated mode.
      if (!(mode === "unified" && to.name === "TailspaceComic")) {
        return { name: "Posts", query: to.query };
      }
    }
    if (mode !== "u18chan" && u18chanRoutes.has(String(to.name))) {
      return { name: "Posts", query: to.query };
    }
    if (mode !== "news" && newsRoutes.has(String(to.name))) {
      return { name: "Posts", query: to.query };
    }
    // Dedicated chrome: never strand on Posts via suggester/analyzer redirects.
    if (mode === "news" && newsRoutes.has(String(to.name))) {
      return true;
    }
    // Pools: e621-family + Inkbunny + Federated — never fall through to SoFurry/Itaku chrome.
    if (
      !modeSupportsPools(mode) &&
      (to.name === "Pools" || to.name === "Pool")
    ) {
      return { name: blockedToolRedirectName(mode), query: to.query };
    }
    // Federated pool reader needs ?origin=e621|e6ai|inkbunny|furbooru (IDs collide across sites).
    if (
      mode === "unified" &&
      to.name === "Pool" &&
      !resolvePoolOrigin(to.query.origin, mode)
    ) {
      return { name: "Pools", query: to.query };
    }
    if (
      !modeSupportsSuggester(mode) &&
      (to.name === "Suggester" || to.name === "SuggesterResult")
    ) {
      return { name: blockedToolRedirectName(mode), query: to.query };
    }
    if (
      !modeSupportsFavoriteAnalyzer(mode) &&
      (to.name === "FavoritesAnalyzer" || to.name === "FavoritesAnalyzerResult")
    ) {
      return { name: blockedToolRedirectName(mode), query: to.query };
    }
    if (
      !modeSupportsDiscoveryTools(mode) &&
      discoveryToolRoutes.has(String(to.name))
    ) {
      return { name: blockedToolRedirectName(mode), query: to.query };
    }
    if (
      !isE621FamilyMode(mode) &&
      ["Dashboard", "DashboardResult"].includes(String(to.name))
    ) {
      return { name: blockedToolRedirectName(mode), query: to.query };
    }
    if (to.name === "SavedPosts" && !modeSupportsSavedPosts(mode)) {
      return { name: blockedToolRedirectName(mode), query: to.query };
    }
  } catch {
    // Pinia not ready yet
  }
  return true;
});

router.beforeResolve(async (to, from) => {
  // FEATURES 8.2 / AI_CONTEXT: never start a view transition on first load.
  // First load has no `from` route. Starting a view transition there captures the
  // empty shell, then persist() replaces the whole store and the overlay never
  // clears — every label renders twice and Posts looks stuck loading.
  if (shouldSkipViewTransition(from, to)) {
    return true;
  }
  const viewTransition = startViewTransition(async () => {
    // dom changes
  })
  await viewTransition.captured
  return true;
})

export default router

interface ViewTransition {
  captured: Promise<void>
  updateCallbackDone: Promise<void>
  ready: Promise<void>
  finished: Promise<void>
  skipTransition: () => void
}

export function startViewTransition(callback?: () => Promise<void>): ViewTransition {
  const viewTransition = {} as ViewTransition
  if (document.startViewTransition) {
    const capturedPromise = new Promise<void>((resolve) => {
      const nativeViewTransition = document.startViewTransition(async () => {
        resolve()
        if (callback) {
          await callback()
        }
      })
      viewTransition.updateCallbackDone = nativeViewTransition.updateCallbackDone
      viewTransition.ready = nativeViewTransition.ready
      viewTransition.finished = nativeViewTransition.finished
      viewTransition.skipTransition =
        nativeViewTransition.skipTransition.bind(nativeViewTransition)
    })
    viewTransition.captured = capturedPromise
  } else {
    viewTransition.captured = Promise.resolve()
    const callbackPromise = callback ? Promise.resolve(callback()) : Promise.resolve()
    viewTransition.updateCallbackDone =
      viewTransition.ready =
      viewTransition.finished =
      callbackPromise
     
    viewTransition.skipTransition = () => { }
    // Unsupported browsers (Firefox etc.): silent fallback (L8).
  }
  return viewTransition
}