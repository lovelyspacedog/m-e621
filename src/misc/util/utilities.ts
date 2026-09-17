import { useRouter } from "vue-router";
import { useMainStore } from "@/services/state";
import { APP_NAME } from "./brand";
import { getGitInfo } from "./git";

export const getAppName = () => {
  const hash = getGitInfo()[0]?.hash?.substring(0, 7);
  return hash ? `${APP_NAME} ${hash}` : APP_NAME;
};
export const getBaseUrl = () => document.location.origin;

const tagColorMapping: { [idx: string]: string | undefined } = {
  character: "light-green",
  copyright: "purple",
  general: "blue-grey",
  invalid: "red",
  default: "grey",
  species: "deep-orange",
  artist: "orange",
  director: "orange",
  lore: "green",
  pool: "pink",
  meta: "grey",
};
const tagIconMapping: { [idx: string]: string | undefined } = {
  default: "mdi-tag",
  pool: "mdi-format-list-text",
  artist: "mdi-palette",
  director: "mdi-movie-open",
};

export const categoryIdToCategoryName = (id: number) => {
  const categories: { [idx: string]: string | undefined } = {
    0: "general",
    1: "artist",
    3: "copyright",
    4: "character",
    5: "species",
    6: "invalid",
    7: "meta",
    8: "lore",
  };
  const name = categories[id] || "invalid";
  if (name === "artist") {
    try {
      if (useMainStore().activeMode === "e6ai") return "director";
    } catch {
      // Pinia not ready (e.g. worker); keep "artist"
    }
  }
  return name;
};

export const useRouterQueryHelpers = () => {
  const router = useRouter();

  // Serialize navigations so concurrent tag/page updates cannot overwrite each
  // other with a stale merge of router.currentRoute (H2). Use replace so page
  // bumps do not pollute browser history (H1).
  let pending: Promise<void> = Promise.resolve();

  const replaceQuery = async (
    build: (current: Record<string, string | string[] | null | undefined>) => Record<
      string,
      string | string[] | null | undefined
    >,
  ) => {
    const run = async () => {
      const next = build({ ...(router.currentRoute.value.query as Record<string, string | string[] | null | undefined>) });
      // Drop undefined so Vue Router clears those keys.
      const cleaned = Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined),
      );
      await router.replace({ query: cleaned });
    };
    pending = pending.then(run, run);
    return pending;
  };

  const updateRouterQuery = async (newQuery: {
    [idx: string]: string | undefined;
  }) => {
    await replaceQuery((current) => ({ ...current, ...newQuery }));
  };

  const removeRouterQuery = async (keys: string[]) => {
    await replaceQuery((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([k]) => !keys.includes(k)),
      ),
    );
  };

  return {
    updateRouterQuery,
    removeRouterQuery,
  };
};

export const getTagColorFromCategory = (category?: string) => {
  return category
    ? tagColorMapping[category] || tagColorMapping.default!
    : tagColorMapping.default!;
};

export const getTagIconFromCategory = (category?: string) => {
  return category
    ? tagIconMapping[category] || tagIconMapping.default!
    : tagIconMapping.default!;
};
