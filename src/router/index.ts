import { createRouter, createWebHashHistory } from 'vue-router'
import { modeSupportsSavedPosts } from '@/misc/util/postOrigin'
import { useMainStore } from '@/services/state'

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
        ) as any,
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
      path: "/:pathMatch(.*)",
      name: "ErrorPage",
      component: () =>
        import(/* webpackChunkName: "misc" */ "@/Error/ErrorPage.vue"),
    },
  ],
})

router.beforeEach((to) => {
  // Mode ↔ route guards (C3 / M31). Pinia may be unavailable during early boot.
  try {
    const mode = useMainStore().activeMode;
    const tailspaceRoutes = new Set([
      "TailspacePosts",
      "TailspaceComics",
      "TailspaceComic",
      "TailspaceFollowing",
    ]);
    const e621ShapedRoutes = new Set([
      "Posts",
      "Pools",
      "Pool",
      "Suggester",
      "SuggesterResult",
      "FavoritesAnalyzer",
      "Dashboard",
      "DashboardResult",
    ]);
    if (mode === "tailspace" && e621ShapedRoutes.has(String(to.name))) {
      return { name: "TailspacePosts" };
    }
    if (mode !== "tailspace" && tailspaceRoutes.has(String(to.name))) {
      return { name: "Posts" };
    }
    if (
      (mode === "furbooru" ||
        mode === "inkbunny" ||
        mode === "furaffinity" ||
        mode === "weasyl" ||
        mode === "itaku" ||
        mode === "local" ||
        mode === "unified") &&
      ["Pools", "Pool", "Suggester", "SuggesterResult", "FavoritesAnalyzer", "Dashboard", "DashboardResult"].includes(
        String(to.name),
      )
    ) {
      return { name: "Posts" };
    }
    if (to.name === "SavedPosts" && !modeSupportsSavedPosts(mode)) {
      return { name: "Posts" };
    }
  } catch {
    // Pinia not ready yet
  }
  return true;
});

router.beforeResolve(async (to, from) => {
  // First load has no `from` route. Starting a view transition there captures the
  // empty shell, then persist() replaces the whole store and the overlay never
  // clears — every label renders twice and Posts looks stuck loading.
  if (!from.name || from.name === to.name) {
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